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

.PARAMETER Upgrade
    Manutenção da VM em vez de deploy: backup da BD, apt-get upgrade (não interativo, mantém
    as configs atuais) e, se o sistema o pedir, reboot. Espera que a app volte a responder.
    Não mexe no código nem nas imagens.

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

.EXAMPLE
    .\scripts\deploy.ps1 -Upgrade
    Atualizar os pacotes da VM (e reiniciá-la, se for preciso).
#>
[CmdletBinding()]
param(
    [ValidateSet('backend', 'frontend', 'db', 'caddy')]
    [string] $Service,
    [switch] $Backup,
    [switch] $Logs,
    [switch] $Status,
    [switch] $Upgrade,
    [switch] $Force,
    [string] $ConfigFile
)

$ErrorActionPreference = 'Stop'

if ($Upgrade -and ($Status -or $Service -or $Force)) {
    Write-Host '     x -Upgrade não se combina com -Status, -Service nem -Force.' -ForegroundColor Red
    exit 1
}

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

if (-not $Status -and -not $Upgrade) {
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
DO_BACKUP='$([int]($Backup.IsPresent -or $Upgrade.IsPresent))'
SHOW_LOGS='$([int]$Logs.IsPresent)'
STATUS_ONLY='$([int]$Status.IsPresent)'
UPGRADE='$([int]$Upgrade.IsPresent)'
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
    step "Últimas 24 h"
    # erros do backend (logs em JSON/ECS) e eventos de segurança que não são entradas normais
    errors=$(dc logs --no-log-prefix --since 24h backend 2>/dev/null | grep -c '"log.level":"ERROR"')
    if [ "${errors:-0}" = "0" ]; then ok "0 erros no log do backend"; else warn "$errors erros no log do backend (dc logs backend | grep ERROR)"; fi
    security=$(dc exec -T db psql -U tracky -d tracky -t -A -c \
        "SELECT count(*) FROM audit_events WHERE kind = 'SECURITY' AND action <> 'LOGIN_SUCCEEDED' AND occurred_at > now() - interval '24 hours'" 2>/dev/null)
    if [ -z "$security" ]; then warn "auditoria indisponível (a tabela audit_events ainda não existe?)"
    elif [ "$security" = "0" ]; then ok "0 eventos de segurança (falhas de entrada, bloqueios, convites recusados)"
    else warn "$security eventos de segurança (falhas de entrada, bloqueios, convites recusados)"; fi
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

# ------------------------------------------------------- manutenção (-Upgrade)
# Sai com 10 quando agenda o reboot: o PowerShell espera então que a app volte.
if [ "$UPGRADE" = "1" ]; then
    step "Pacotes do sistema"
    sudo apt-get update -qq || { fail "apt-get update falhou"; exit 1; }
    pending=$(apt list --upgradable 2>/dev/null | tail -n +2)
    if [ -n "$pending" ]; then
        printf '%s\n' "$pending" | sed 's/^/    /'
        # Lock::Timeout: o unattended-upgrades pode estar a correr; espera em vez de falhar.
        if ! sudo DEBIAN_FRONTEND=noninteractive apt-get -y -q -o DPkg::Lock::Timeout=600 \
                -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold \
                upgrade > /tmp/tracky-apt.log 2>&1; then
            fail "apt-get upgrade falhou: $(tail -3 /tmp/tracky-apt.log)"
            exit 1
        fi
        ok "$(printf '%s\n' "$pending" | wc -l) pacote(s) atualizado(s)"
    else
        ok "nada para atualizar"
    fi
    if [ ! -f /var/run/reboot-required ]; then
        ok "o sistema não pede reboot"
        step "Health check"
        wait_app
        exit $?
    fi
    step "Reiniciar a VM"
    if [ "$(systemctl is-enabled docker 2>/dev/null)" != "enabled" ]; then
        fail "o Docker não arranca com o sistema — reboot cancelado (sudo systemctl enable docker)"
        exit 1
    fi
    warn "pedido por: $(sort -u /var/run/reboot-required.pkgs 2>/dev/null | tr '\n' ' ')"
    # Agendado para daqui a 5 s, para a sessão SSH fechar limpa antes de a VM ir abaixo.
    sudo systemd-run --quiet --on-active=5 systemctl reboot \
        || { fail "não foi possível agendar o reboot"; exit 1; }
    ok "reboot em 5 s — os containers voltam sozinhos (restart: unless-stopped)"
    exit 10
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

# -Upgrade com reboot: a sessão já fechou, o health check passa a ser feito daqui.
if ($code -eq 10) {
    if (-not $domain) {
        Write-Warn 'DOMAIN não definido — não consigo confirmar que a app voltou.'
        $code = 0
    } else {
        Write-Host ''
        Write-Info 'à espera que a VM volte (até 5 min)...'
        $code = 1
        for ($i = 0; $i -lt 60; $i++) {
            Start-Sleep -Seconds 5
            $front = & curl.exe -s -o NUL -w '%{http_code}' --max-time 10 "https://$domain/"
            $api   = & curl.exe -s -o NUL -w '%{http_code}' --max-time 10 "https://$domain/api/dashboard"
            if ($front -eq '200' -and $api -notmatch '^(000|5)') {
                Write-Info "app a responder — frontend HTTP $front · API HTTP $api"
                $code = 0
                break
            }
        }
        if ($code -ne 0) { Write-Err "a app não voltou a responder (frontend=$front api=$api)." }
    }
}
$elapsed = (Get-Date) - $started

Write-Host ''
$took = '{0:mm\:ss}' -f $elapsed
if ($code -eq 0) {
    if ($Status) {
        Write-Host "  Diagnóstico concluído ($took)" -ForegroundColor Green
    } elseif ($Upgrade) {
        Write-Host "  VM atualizada em $took" -ForegroundColor Green
    } else {
        Write-Host "  Produção atualizada em $took" -ForegroundColor Green
        if ($domain) { Write-Info "https://$domain" }
    }
} elseif ($code -eq 255) {
    Write-Err "Falha de SSH (não cheguei a $vmHost)."
    Write-Info 'Verifica se a VM está ligada e se o IP em .env.deploy está certo (o IP da Oracle é ephemeral).'
    Write-Info 'Se a queixa for das permissões da chave, vê a secção SSH do CHEATSHEET.md.'
} elseif ($Upgrade) {
    Write-Err "A manutenção falhou (código $code)."
    Write-Info 'A saída acima diz em que passo parou; o backup da BD ficou em ~/backups na VM.'
} else {
    Write-Err "O deploy falhou (código $code) — nada foi confirmado como no ar."
    Write-Info 'A saída acima diz em que passo parou; o comando de rollback aparece lá se for o caso.'
}
Write-Host ''
exit $code
