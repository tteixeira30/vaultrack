import { useEffect, useMemo, useRef, useState } from 'react'
import { api, fmtEur, parseAmount } from '../api'
import { analyzeStatement, analyzeRows, buildTransactions, categoryKey } from '../statementParser'
import { catLabel } from '../categories'
import Modal from './Modal'
import Dropdown from './Dropdown'
import { useToast } from './Toast'
import { IconUpload, IconArrowUp, IconArrowDown } from './Icons'

const FORMAT_LABEL = {
  revolut: 'Revolut', santander: 'Santander', traderepublic: 'Trade Republic',
  generic: 'genérico', unknown: 'não reconhecido',
}

/**
 * O parser de PDF vem num chunk carregado por import() dinâmico, com hash no
 * nome. Se a app for atualizada com esta página já aberta, o ficheiro que ela
 * pede deixa de existir e o import rejeita — não é o PDF que está ilegível, é a
 * página que é da versão anterior. Sem distinguir os dois casos, quem importa
 * lia "usa o extrato em CSV ou PDF do banco" e ia procurar outro ficheiro que
 * nunca havia de resolver nada.
 */
const isStaleChunkError = (e) =>
  /dynamically imported module|module script failed|Importing a module/i.test(String(e?.message || ''))

/**
 * Importação de extrato bancário (CSV ou PDF), em modal.
 *
 * Vive fora da página de Movimentos porque o design tem dois pontos de entrada:
 * o botão "Importar extrato" da lista e o cartão de importação do ecrã Contas.
 * Toda a lógica de deteção de formato e mapeamento de colunas está no
 * `statementParser`; aqui só se orquestra o fluxo e se mostra a pré-visualização.
 */
export default function StatementImport({ open, onClose, accounts, defaultAccountId, onImported }) {
  const toast = useToast()
  const fileRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [accountId, setAccountId] = useState('')
  const [file, setFile] = useState(null) // { name, analysis }
  const [mapping, setMapping] = useState(null)
  const [rules, setRules] = useState(null) // { matchKey: category }
  const [periodUsage, setPeriodUsage] = useState(null) // { key, count }

  useEffect(() => {
    if (!open) return
    setAccountId(defaultAccountId || String(accounts[0]?.id || ''))
    setFile(null)
    setMapping(null)
    // regras aprendidas, para a pré-visualização mostrar as categorias finais
    api.getCategoryRules()
      .then((list) => setRules(Object.fromEntries(list.map((r) => [r.matchKey, r.category]))))
      .catch(() => setRules(null))
  }, [open, defaultAccountId, accounts])

  const onFile = async (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    try {
      let analysis
      if (/\.pdf$/i.test(f.name) || f.type === 'application/pdf') {
        const { extractPdfRows } = await import('../pdfStatement')
        const { rows, hasText } = await extractPdfRows(await f.arrayBuffer())
        if (!hasText) {
          toast.error('PDF digitalizado', 'Este PDF não tem texto (é uma imagem). Usa o PDF original do banco ou exporta em CSV.')
          return
        }
        analysis = analyzeRows(rows)
      } else {
        analysis = analyzeStatement(await f.text())
      }
      if (!analysis || analysis.dataRows.length === 0) {
        toast.error('Ficheiro vazio', 'Não foram encontradas linhas de movimentos no ficheiro.')
        return
      }
      setFile({ name: f.name, analysis })
      setMapping(analysis.mapping)
    } catch (err) {
      if (isStaleChunkError(err)) {
        toast.error('Versão desatualizada', 'A app foi atualizada entretanto. Recarrega a página e importa outra vez.')
        return
      }
      toast.error('Erro ao ler', 'Não foi possível ler o ficheiro. Usa o extrato em CSV ou PDF do banco.')
    }
  }

  const preview = useMemo(() => {
    if (!file || !mapping) return null
    if (mapping.date === -1 || mapping.description === -1 || (mapping.amount === -1 && mapping.debit === -1)) return null
    const result = buildTransactions(file.analysis.dataRows, mapping, file.analysis.dateHint, file.analysis.openingBalance)
    if (rules) {
      for (const r of result.rows) {
        const ruled = rules[categoryKey(r.description)]
        if (ruled) r.category = ruled
      }
    }
    return result
  }, [file, mapping, rules])

  // período coberto pelo extrato (usado no resumo e no aviso de sobreposição)
  const range = useMemo(() => {
    if (!preview || preview.rows.length === 0) return null
    let min = preview.rows[0].date, max = preview.rows[0].date
    for (const r of preview.rows) {
      if (r.date < min) min = r.date
      if (r.date > max) max = r.date
    }
    return { min, max }
  }, [preview])

  // Movimentos que a conta escolhida já tem neste período. A deduplicação exige
  // data, valor, sentido e descrição iguais, por isso o mesmo extrato noutro
  // formato pode passar-lhe ao lado — mais vale avisar antes de importar.
  // A contagem guarda a chave a que pertence: assim nunca se mostra o número de
  // uma consulta anterior.
  const usageKey = open && accountId && range ? `${accountId}|${range.min}|${range.max}` : null
  useEffect(() => {
    if (!usageKey) return undefined
    let cancelled = false
    api.getPeriodUsage(Number(accountId), range.min, range.max)
      .then((r) => { if (!cancelled) setPeriodUsage({ key: usageKey, count: r.transactionCount }) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [usageKey, accountId, range])

  const doImport = async () => {
    if (!accountId) { toast.error('Conta em falta', 'Escolhe a conta a que pertence o extrato.'); return }
    if (!preview || preview.rows.length === 0) { toast.error('Sem movimentos', 'Não há movimentos válidos para importar.'); return }
    setBusy(true)
    try {
      const res = await api.importTransactions({
        accountId: Number(accountId), rows: preview.rows, closingBalance: preview.closingBalance,
      })
      onClose()
      await onImported?.()
      toast.success('Extrato importado',
        `${res.imported} movimento(s) adicionados${res.skipped ? ` · ${res.skipped} duplicado(s) ignorados` : ''}.`
        + (preview.closingBalance != null ? ` Saldo da conta atualizado para ${fmtEur(res.balance)}.` : ''))
    } catch (e) { toast.error('Erro ao importar', e.message) }
    finally { setBusy(false) }
  }

  const mappingOptions = (headers) => [
    { value: '-1', label: '— nenhuma —' },
    ...headers.map((h, i) => ({ value: String(i), label: h || `Coluna ${i + 1}` })),
  ]
  const setMap = (key, v) => setMapping((m) => ({ ...m, [key]: Number(v) }))

  return (
    <Modal open={open} onClose={onClose} width={620}
           title="Importar extrato bancário"
           subtitle="Exporta o extrato do teu banco em CSV ou PDF e carrega-o aqui. Movimentos duplicados são ignorados automaticamente."
           footer={
             <>
               <button className="btn ghost" onClick={onClose}>Cancelar</button>
               <button className="btn" onClick={doImport} disabled={busy || !preview || preview.rows.length === 0}>
                 {busy ? 'A importar…' : `Importar${preview ? ` ${preview.rows.length} movimento(s)` : ''}`}
               </button>
             </>
           }>
      <div className="form-grid">
        <div className="field">
          <label>Conta do extrato</label>
          <Dropdown value={accountId} onChange={setAccountId}
                    options={accounts.map((a) => ({ value: String(a.id), label: a.name }))} />
        </div>
        <div className="field">
          <label>Ficheiro (CSV ou PDF)</label>
          <input ref={fileRef} type="file" accept=".csv,.txt,.pdf,text/csv,application/pdf" style={{ display: 'none' }} onChange={onFile} />
          <button className="btn ghost" style={{ width: '100%' }} onClick={() => fileRef.current?.click()}>
            <IconUpload size={14} /> {file ? file.name : 'Escolher ficheiro…'}
          </button>
        </div>
      </div>

      {file && (
        <>
          <p className="dim" style={{ margin: '10px 2px 6px' }}>
            Formato detetado: <strong>{FORMAT_LABEL[file.analysis.format]}</strong>
            {file.analysis.format === 'unknown' && ' — indica abaixo a que corresponde cada coluna.'}
            {' '}Valores assumidos em EUR (linhas noutra moeda são ignoradas).
          </p>

          {(file.analysis.format === 'unknown' || !preview) && (
            <div className="form-grid">
              <div className="field">
                <label>Coluna da data</label>
                <Dropdown value={String(mapping.date)} onChange={(v) => setMap('date', v)} options={mappingOptions(file.analysis.headers)} />
              </div>
              <div className="field">
                <label>Coluna da descrição</label>
                <Dropdown value={String(mapping.description)} onChange={(v) => setMap('description', v)} options={mappingOptions(file.analysis.headers)} />
              </div>
              <div className="field">
                <label>Coluna do montante (com sinal)</label>
                <Dropdown value={String(mapping.amount)} onChange={(v) => setMap('amount', v)} options={mappingOptions(file.analysis.headers)} />
              </div>
              <div className="field">
                <label>…ou Débito / Crédito</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Dropdown value={String(mapping.debit)} onChange={(v) => setMap('debit', v)} options={mappingOptions(file.analysis.headers)} />
                  <Dropdown value={String(mapping.credit)} onChange={(v) => setMap('credit', v)} options={mappingOptions(file.analysis.headers)} />
                </div>
              </div>
            </div>
          )}

          {preview && preview.rows.length > 0 && range && (() => {
            const months = (Number(range.max.slice(0, 4)) - Number(range.min.slice(0, 4))) * 12
              + Number(range.max.slice(5, 7)) - Number(range.min.slice(5, 7)) + 1
            const fmtD = (iso) => new Date(iso).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' })
            return (
              <div className="import-preview">
                <div className="import-summary">
                  <span>{preview.rows.length} movimento(s) prontos a importar</span>
                  {preview.ignored > 0 && <span className="dim">{preview.ignored} linha(s) ignoradas</span>}
                </div>
                <p className="dim import-range">
                  Período: {fmtD(range.min)} a {fmtD(range.max)}{months > 1 ? ` · ${months} meses` : ''}
                  {preview.closingBalance != null
                    ? ` · saldo da conta passa a ${fmtEur(preview.closingBalance)}`
                    : ' · sem saldo no extrato, o saldo da conta fica como está'}
                </p>
                {periodUsage?.key === usageKey && periodUsage.count > 0 && (
                  <p className="import-overlap" role="status">
                    Esta conta já tem {periodUsage.count} movimento(s) neste período. Os que forem
                    exatamente iguais (data, valor, sentido e descrição) são ignorados, mas o
                    mesmo extrato noutro formato pode trazer datas ou descrições ligeiramente
                    diferentes e entrar duas vezes.
                  </p>
                )}
                <ul className="event-list">
                  {preview.rows.slice(0, 8).map((r, i) => (
                    <li key={i} className="event-row">
                      <span className={`code-chip ${r.inflow ? 'green' : 'red'}`}>
                        {r.inflow ? <IconArrowUp size={13} /> : <IconArrowDown size={13} />}
                      </span>
                      <div className="event-main">
                        <strong>{r.description}</strong>
                        <span>{r.date} · {catLabel(r.category)}</span>
                      </div>
                      <span className={`mono ${r.inflow ? 'pos' : 'neg'}`}>{r.inflow ? '+' : '−'}{fmtEur(r.amount)}</span>
                    </li>
                  ))}
                </ul>
                {preview.rows.length > 8 && <p className="dim" style={{ margin: '6px 2px 0' }}>… e mais {preview.rows.length - 8} movimento(s).</p>}
              </div>
            )
          })()}
          {preview && preview.rows.length === 0 && (
            <p className="dim" style={{ margin: '10px 2px' }}>Nenhum movimento válido encontrado — verifica o mapeamento das colunas.</p>
          )}
        </>
      )}
    </Modal>
  )
}

/** Modal de criação/edição de conta corrente — partilhado por Movimentos e Contas. */
export function AccountModal({ open, account, busy, onClose, onSave, currencySymbol }) {
  const [name, setName] = useState('')
  const [balance, setBalance] = useState('')

  useEffect(() => {
    if (!open) return
    setName(account?.name ?? '')
    setBalance(account?.balanceInput ?? '')
  }, [open, account])

  const submit = () => onSave({ name: name.trim(), balance })

  return (
    <Modal open={open} onClose={onClose} onSubmit={submit} busy={busy}
           title={account ? 'Editar conta' : 'Nova conta corrente'}
           subtitle="Ex.: Santander, Trade Republic, Revolut."
           footer={
             <>
               <button className="btn ghost" onClick={onClose}>Cancelar</button>
               <button className="btn" onClick={submit} disabled={busy}>{busy ? 'A guardar…' : 'Guardar'}</button>
             </>
           }>
      <div className="form-grid">
        <div className="field full">
          <label>Nome da conta</label>
          <input placeholder="Ex: Santander" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field full">
          <label>Saldo atual (opcional)</label>
          <div className="input-affix">
            <input type="text" inputMode="decimal" placeholder="Deixa em branco se não quiseres registar"
                   value={balance} onChange={(e) => setBalance(e.target.value)} />
            <span className="affix">{currencySymbol}</span>
          </div>
        </div>
      </div>
    </Modal>
  )
}

/** Validação partilhada do formulário de conta. */
export const validateAccount = ({ name, balance }) => {
  if (!name) return 'Indica o nome da conta.'
  if (balance !== '' && !Number.isFinite(parseAmount(balance))) return 'Indica um saldo válido (ou deixa em branco).'
  return null
}
