#Requires -Version 5.1
<#
.SYNOPSIS
    Faz o deploy do Tracky na VM de produção — git pull + rebuild — sem entrar por SSH à mão.

.DESCRIPTION
    Liga-se à VM por SSH e, lá dentro: verifica o repositório, mostra os commits novos,
    faz fast-forward do branch de produção, reconstrói as imagens Docker, espera que a app
    responda em HTTPS e limpa as imagens órfãs. Aborta (sem tocar em nada) se o repositório
    da VM tiver alterações locais ou se o fast-forward não for possível.

    A configuração (IP, chave SSH, domínio) vive em ".env.deploy" na raiz do projeto —
    ficheiro local, ignorado pelo git. Copia ".env.deploy.example" e preenche.

.PARAMETER Service
    Reconstrói só um serviço (backend, frontend, db, caddy) em vez da stack toda.

.PARAMETER Backup
    Faz pg_dump da base de dados antes de atualizar (guarda em ~/backups na VM, mantém os 7
    mais recentes). Se o backup falhar, o deploy não avança.

.PARAMETER Logs
    Mostra as últimas 60 linhas do backend no fim.

.PARAMETER Status
    Só diagnostica: versão atual, containers, disco, memória e health check. Não altera nada.

.PARAMETER Force
    Reconstrói mesmo que a VM já esteja no commit mais recente (útil depois de mexer no .env).

.PARAMETER ConfigFile
    Caminho alternativo para o ficheiro de configuração.

.EXAMPLE
    .\scripts\deploy.ps1
    Deploy normal: pull + rebuild da stack completa.

.EXAMPLE
    .\scripts\deploy.ps1 -Backup -Logs
    Backup da BD antes de atualizar e logs do backend no fim.

.EXAMPLE
    .\scripts\deploy.ps1 -Status
    Ver como está a produção, sem deploy.
#>
[CmdletBinding()]
param(
    [ValidateSet('backend', 'frontend', 'db', 'caddy')]
    [string] $Service,
    [switch] $Backup,
    [switch] $Logs,
    [switch] $Status,
    [switch] $Force,
    [string] $ConfigFile
)

$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------- apresentação

function Write-Head([string] $Text) {
    Write-Host ''
    Write-Host "  $Text" -ForegroundColor White
    Write-Host ('  ' + ('-' * $Text.Length)) -ForegroundColor DarkGray
}
function Write-Info([string] $Text) { Write-Host "     $Text" -ForegroundColor Gray }
function Write-Warn([string] $Text) { Write-Host "     ! $Text" -ForegroundColor Yellow }
function Write-Err ([string] $Text) { Write-Host "     x $Text" -ForegroundColor Red }

# ---------------------------------------------------------------- configuração

function Read-DeployConfig([string] $Path) {
    $cfg = @{}
    foreach ($line in (Get-Content -LiteralPath $Path)) {
        $t = $line.Trim()
        if ($t.Length -eq 0 -or $t.StartsWith('#')) { continue }
        $i = $t.IndexOf('=')
        if ($i -lt 1) { continue }
        $key = $t.Substring(0, $i).Trim()
        $val = $t.Substring($i + 1).Trim()
        if ($val.Length -ge 2) {
            $quoted = ($val.StartsWith('"') -and $val.EndsWith('"')) -or
                      ($val.StartsWith("'") -and $val.EndsWith("'"))
            if ($quoted) { $val = $val.Substring(1, $val.Length - 2) }
        }
        $cfg[$key] = $val
    }
    return $cfg
}

function Get-Setting($Config, [string] $Key, [string] $Default, [bool] $Required) {
    $val = $Default
    if ($Config.ContainsKey($Key) -and $Config[$Key].Length -gt 0) { $val = $Config[$Key] }
    if ($Required -and [string]::IsNullOrWhiteSpace($val)) {
        throw "Falta '$Key' no ficheiro de configuração ($ConfigFile)."
    }
    # Os valores entram num script bash entre apóstrofos — recusa o que quebraria o quoting.
    if ($val -match "['`"``$]") {
        throw "O valor de '$Key' tem caracteres não suportados (' `" `$ ``)."
    }
    return $val
}

$repoRoot = Split-Path -Parent $PSScriptRoot
if (-not $ConfigFile) { $ConfigFile = Join-Path $repoRoot '.env.deploy' }

if (-not (Test-Path -LiteralPath $ConfigFile)) {
    Write-Err "Não encontrei a configuração: $ConfigFile"
    Write-Host ''
    Write-Info 'Cria-a a partir do exemplo e preenche os valores da tua VM:'
    Write-Host '       Copy-Item .env.deploy.example .env.deploy; notepad .env.deploy' -ForegroundColor Cyan
    Write-Host ''
    exit 1
}

$cfg        = Read-DeployConfig $ConfigFile
$vmHost     = Get-Setting $cfg 'VM_HOST'      ''                        $true
$vmUser     = Get-Setting $cfg 'VM_USER'      'ubuntu'                  $true
$sshKey     = Get-Setting $cfg 'SSH_KEY'      ''                        $true
$sshPort    = Get-Setting $cfg 'SSH_PORT'     '22'                      $true
$remoteDir  = Get-Setting $cfg 'REMOTE_DIR'   '~/Tracky'                $true
$branch     = Get-Setting $cfg 'BRANCH'       'main'                    $true
$composeFile= Get-Setting $cfg 'COMPOSE_FILE' 'docker-compose.prod.yml' $true
$domain     = Get-Setting $cfg 'DOMAIN'       ''                        $false

if (-not (Test-Path -LiteralPath $sshKey)) {
    Write-Err "Chave SSH não encontrada: $sshKey"
    Write-Info "Corrige SSH_KEY em $ConfigFile."
    exit 1
}
$sshKey = (Resolve-Path -LiteralPath $sshKey).Path

# --------------------------------------------------- pré-voo local (informativo)

Write-Host ''
Write-Host '  Tracky · deploy' -ForegroundColor Cyan
Write-Info "destino:  $vmUser@$vmHost : $remoteDir  (branch $branch)"
if ($domain) { Write-Info "app:      https://$domain" }
if ($Service) { Write-Info "serviço:  só $Service" }

if (-not $Status) {
    try {
        Push-Location $repoRoot
        git fetch --quiet origin $branch 2>$null
        $ahead = (git rev-list --count "origin/$branch..$branch" 2>$null)
        if ($LASTEXITCODE -eq 0 -and $ahead -and [int]$ahead -gt 0) {
            Write-Warn "tens $ahead commit(s) em '$branch' que ainda não foram para o GitHub — a VM só recebe o que já lá está."
        }
    } catch {
        # Sem rede ou sem git: o pré-voo é opcional, o deploy usa o estado do GitHub.
    } finally {
        Pop-Location
    }
}

# ------------------------------------------------------------- script remoto

$prelude = @"
REMOTE_DIR='$remoteDir'
COMPOSE_FILE='$composeFile'
BRANCH='$branch'
DOMAIN='$domain'
SERVICE='$Service'
DO_BACKUP='$([int]$Backup.IsPresent)'
SHOW_LOGS='$([int]$Logs.IsPresent)'
STATUS_ONLY='$([int]$Status.IsPresent)'
FORCE='$([int]$Force.IsPresent)'
"@

$body = @'
set -uo pipefail

step() { printf '\n\033[1;36m==> %s\033[0m\n' "$1"; }
ok()   { printf '    \033[32mok\033[0m   %s\n' "$1"; }
warn() { printf '    \033[33m!\033[0m    %s\n' "$1"; }
fail() { printf '    \033[31mERRO\033[0m %s\n' "$1" >&2; }

dc() { sudo docker compose -f "$COMPOSE_FILE" "$@"; }

http_code() {
    local code
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$1" 2>/dev/null)
    if [ -z "$code" ]; then code='000'; fi
    printf '%s' "$code"
}

# Frontend tem de dar 200; a API só precisa de responder algo que não seja
# "sem resposta" (000) ou erro de servidor (5xx) — sem token, 401/403 é o normal.
wait_app() {
    if [ -z "$DOMAIN" ]; then
        warn "DOMAIN não definido — health check HTTP ignorado"
        return 0
    fi
    local i front api
    for i in $(seq 1 30); do
        front=$(http_code "https://$DOMAIN/")
        api=$(http_code "https://$DOMAIN/api/dashboard")
        case "$api" in
            000|5*) ;;
            *) if [ "$front" = "200" ]; then
                   ok "app a responder — frontend HTTP $front · API HTTP $api"
                   return 0
               fi ;;
        esac
        sleep 4
    done
    fail "a app não respondeu como esperado (frontend=$front api=$api)"
    return 1
}

rollback_hint() {
    printf '\n    Para voltar à versão anterior:\n'
    printf '      cd %s && git reset --hard %s && sudo docker compose -f %s up -d --build\n' \
        "$REMOTE_DIR" "$1" "$COMPOSE_FILE"
}

# O ~ vem entre apóstrofos do prelúdio, por isso não expande sozinho.
case "$REMOTE_DIR" in
    '~'|'~/'*) REMOTE_DIR="$HOME${REMOTE_DIR#\~}" ;;
esac

cd "$REMOTE_DIR" 2>/dev/null || { fail "a pasta $REMOTE_DIR não existe na VM"; exit 1; }
[ -f "$COMPOSE_FILE" ] || { fail "$COMPOSE_FILE não existe em $REMOTE_DIR"; exit 1; }

# ------------------------------------------------------------------- estado
if [ "$STATUS_ONLY" = "1" ]; then
    step "Versão em produção"
    git --no-pager log -1 --format='    %h  %s%n    %an · %cr'
    step "Containers"
    dc ps
    step "Recursos"
    df -h / | awk 'NR==2{printf "    disco: %s livres de %s (%s usado)\n", $4, $2, $5}'
    free -h | awk 'NR==2{printf "    RAM:   %s usada de %s\n", $3, $2}'
    step "Health check"
    wait_app
    exit $?
fi

# ------------------------------------------------------------------- backup
if [ "$DO_BACKUP" = "1" ]; then
    step "Backup da base de dados"
    mkdir -p "$HOME/backups"
    dump="$HOME/backups/tracky-$(date +%F-%H%M%S).sql"
    if sudo docker exec tracky-db pg_dump -U tracky tracky > "$dump" 2>/tmp/tracky-pgdump.err; then
        ok "$dump ($(du -h "$dump" | cut -f1))"
        ls -1t "$HOME"/backups/tracky-*.sql 2>/dev/null | tail -n +8 | xargs -r rm -f
    else
        rm -f "$dump"
        fail "o backup falhou — deploy abortado: $(tail -1 /tmp/tracky-pgdump.err)"
        exit 1
    fi
fi

# ---------------------------------------------------------------- git na VM
step "Repositório na VM"
if ! git diff --quiet || ! git diff --cached --quiet; then
    fail "há alterações não comitadas em $REMOTE_DIR — resolve-as na VM primeiro"
    git --no-pager status --short
    exit 1
fi

git fetch --quiet origin "$BRANCH" || { fail "git fetch falhou (rede? credenciais?)"; exit 1; }
before=$(git rev-parse HEAD)
target=$(git rev-parse "origin/$BRANCH")
current_branch=$(git rev-parse --abbrev-ref HEAD)
ok "está em $(git rev-parse --short HEAD) ($current_branch)"

if [ "$before" = "$target" ] && [ "$FORCE" != "1" ]; then
    ok "já é a versão mais recente de origin/$BRANCH — nada para atualizar"
    step "Garantir que a stack está a correr"
    dc up -d || { fail "não foi possível arrancar a stack"; exit 1; }
    dc ps
    step "Health check"
    wait_app || exit 1
    printf '\n    (usa -Force para reconstruir mesmo sem commits novos)\n'
    exit 0
fi

if [ "$before" != "$target" ]; then
    step "Commits a aplicar ($(git rev-list --count "$before..$target"))"
    git --no-pager log --oneline --no-decorate --max-count=20 "$before..$target"
    if [ "$current_branch" != "$BRANCH" ]; then
        warn "a VM estava no branch $current_branch — a mudar para $BRANCH"
        git checkout "$BRANCH" || { fail "git checkout $BRANCH falhou"; exit 1; }
    fi
    git merge --ff-only "origin/$BRANCH" || {
        fail "não foi possível avançar para origin/$BRANCH sem merge (histórico divergente)"
        exit 1
    }
    ok "atualizado para $(git rev-parse --short HEAD)"
else
    warn "sem commits novos — a reconstruir por -Force"
fi

# -------------------------------------------------------------- build/arranque
if [ -n "$SERVICE" ]; then
    step "Reconstruir e arrancar ($SERVICE)"
else
    step "Reconstruir e arrancar a stack"
fi
printf '    (a primeira build depois de mexer no backend pode levar alguns minutos)\n\n'

if ! dc up -d --build ${SERVICE:+"$SERVICE"}; then
    fail "o build/arranque falhou"
    dc logs --tail 40
    rollback_hint "$before"
    exit 1
fi

step "Containers"
dc ps

step "Health check"
if ! wait_app; then
    dc logs --tail 40 backend
    rollback_hint "$before"
    exit 1
fi

step "Limpeza"
pruned=$(sudo docker image prune -f 2>/dev/null | tail -1)
ok "${pruned:-nada a limpar}"
df -h / | awk 'NR==2{printf "    disco: %s livres de %s (%s usado)\n", $4, $2, $5}'

if [ "$SHOW_LOGS" = "1" ]; then
    step "Backend — últimas 60 linhas"
    dc logs --tail 60 backend
fi

step "Deploy concluído"
git --no-pager log -1 --format='    %h  %s%n    %an · %cr'
'@

# Normaliza para LF (bash não gosta de CR) e envia em base64 para evitar quoting.
$remoteScript = ($prelude + "`n" + $body) -replace "`r`n", "`n"
$encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($remoteScript))

$sshArgs = @(
    '-i', $sshKey,
    '-p', $sshPort,
    '-o', 'StrictHostKeyChecking=accept-new',
    '-o', 'ConnectTimeout=15',
    "$vmUser@$vmHost"
)

$started = Get-Date
& ssh @sshArgs "echo $encoded | base64 -d | bash -s"
$code = $LASTEXITCODE
$elapsed = (Get-Date) - $started

Write-Host ''
$took = '{0:mm\:ss}' -f $elapsed
if ($code -eq 0) {
    if ($Status) {
        Write-Host "  Diagnóstico concluído ($took)" -ForegroundColor Green
    } else {
        Write-Host "  Produção atualizada em $took" -ForegroundColor Green
        if ($domain) { Write-Info "https://$domain" }
    }
} elseif ($code -eq 255) {
    Write-Err "Falha de SSH (não cheguei a $vmHost)."
    Write-Info 'Verifica se a VM está ligada e se o IP em .env.deploy está certo (o IP da Oracle é ephemeral).'
    Write-Info 'Se a queixa for das permissões da chave, vê a secção SSH do CHEATSHEET.md.'
} else {
    Write-Err "O deploy falhou (código $code) — nada foi confirmado como no ar."
    Write-Info 'A saída acima diz em que passo parou; o comando de rollback aparece lá se for o caso.'
}
Write-Host ''
exit $code
