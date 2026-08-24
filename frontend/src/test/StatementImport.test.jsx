import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import StatementImport from '../components/StatementImport'

const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() }
vi.mock('../components/Toast', () => ({ useToast: () => toast }))

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    api: {
      getCategoryRules: vi.fn().mockResolvedValue([]),
      getPeriodUsage: vi.fn().mockResolvedValue({ transactionCount: 0 }),
      importTransactions: vi.fn(),
    },
  }
})

// Reproduz o cenário real: a app foi reconstruída com esta página aberta e o
// chunk do parser de PDF já não existe no servidor. O erro é o que o browser
// atira quando o import() dinâmico não consegue carregar o módulo (aqui pelo
// getter, que é o momento em que o componente lhe toca).
vi.mock('../pdfStatement', () => ({
  get extractPdfRows() {
    throw new TypeError('Failed to fetch dynamically imported module: /assets/pdfStatement-CYd60zc3.js')
  },
}))

const accounts = [{ id: 10, name: 'Revolut', currentBalance: 0 }]

const carregar = async (name, type) => {
  const user = userEvent.setup()
  render(<StatementImport open accounts={accounts} defaultAccountId="10" onClose={() => {}} />)
  await user.upload(document.querySelector('input[type="file"]'), new File(['%PDF-1.7'], name, { type }))
}

describe('StatementImport — chunk do parser de PDF em falta', () => {
  beforeEach(() => {
    toast.error.mockClear()
  })

  it('diz para recarregar a página, em vez de culpar o ficheiro', async () => {
    await carregar('Extrato Revolut.pdf', 'application/pdf')

    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1))
    expect(toast.error).toHaveBeenCalledWith('Versão desatualizada', expect.stringMatching(/Recarrega a página/))
  })

  it('um ficheiro que não é PDF continua a dar o erro de leitura normal', async () => {
    // sem colunas reconhecíveis: o CSV é lido, mas não tem movimentos
    await carregar('lista.csv', 'text/csv')

    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1))
    expect(toast.error.mock.calls[0][0]).not.toBe('Versão desatualizada')
  })
})
