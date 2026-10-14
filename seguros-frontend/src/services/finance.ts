import { supabase } from '@/lib/supabase'
import type { Policy } from '@/services/policies'

export type InstallmentStatus = 'pendente' | 'paga' | 'cancelada'
export type Installment = {
  id: string
  policy_id: string
  installment_number: number
  amount: number
  due_date: string
  paid_at: string | null
  paid_amount: number | null
  status: InstallmentStatus
  payment_method: string | null
  reference: string | null
  notes: string | null
  is_active: boolean
  created_at: string
}
export type InstallmentForm = {
  policy_id: string
  installment_number: string
  amount: string
  due_date: string
  notes: string
}
type Page<T> = { data: T[]; pagination: { total: number; limit: number; offset: number } }

async function request<T>(path: string, method: 'GET' | 'POST' | 'PATCH', payload?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(`insurance-api/${path}`, {
    method,
    ...(payload ? { body: payload } : {}),
  })
  if (error) {
    const response = (error as { context?: Response }).context
    if (response && typeof response.clone === 'function') {
      const detail = await response.clone().json().catch(() => null) as { error?: string; message?: string } | null
      if (detail?.error || detail?.message) throw new Error(detail.error || detail.message)
    }
    throw new Error(error.message)
  }
  return data as T
}

async function all<T>(resource: 'policies' | 'policy_installments', filter = ''): Promise<T[]> {
  const result: T[] = []
  for (let offset = 0; offset <= 4900; offset += 100) {
    const query = new URLSearchParams({ limit: '100', offset: String(offset) })
    if (filter) query.set('policy_id', filter)
    const page = await request<Page<T>>(`${resource}?${query.toString()}`, 'GET')
    result.push(...page.data)
    if (page.data.length === 0 || result.length >= page.pagination.total) return result
  }
  throw new Error('Mais de 5.000 registros. É necessário paginar esta consulta no backend.')
}
export const listInstallments = () => all<Installment>('policy_installments')
export const listFinancePolicies = () => all<Policy>('policies')

function amountNumber(value: string): number {
  const parsed = Number(value.trim().replace(',', '.'))
  if (!value.trim() || !Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('Informe um valor válido e maior que zero (ex.: 350.50).')
  }
  return Math.round(parsed * 100) / 100
}

export async function createInstallment(form: InstallmentForm): Promise<Installment> {
  const n = Number(form.installment_number)
  if (!form.policy_id || !Number.isSafeInteger(n) || n <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(form.due_date)) {
    throw new Error('Selecione uma apólice e informe número e data válidos.')
  }
  const response = await request<{ data: Installment }>('policy_installments', 'POST', {
    policy_id: form.policy_id, installment_number: n, amount: amountNumber(form.amount),
    due_date: form.due_date, notes: form.notes.trim() || null,
  })
  return response.data
}

export async function changeInstallment(id: string, changes: Record<string, unknown>): Promise<Installment> {
  return (await request<{ data: Installment }>(`policy_installments/${id}`, 'PATCH', changes)).data
}

export async function payInstallment(item: Installment, paidAt: string, paidAmount: string, paymentMethod: string, reference: string) {
  if (item.status !== 'pendente') throw new Error('Somente parcelas pendentes podem ser pagas.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidAt)) throw new Error('Informe a data do pagamento.')
  if (amountNumber(paidAmount) > Number(item.amount)) throw new Error('Valor recebido maior que o valor da parcela. Revise a baixa.')
  return changeInstallment(item.id, {
    status: 'paga', paid_at: paidAt, paid_amount: amountNumber(paidAmount),
    payment_method: paymentMethod.trim() || null, reference: reference.trim() || null,
  })
}

export async function undoPayment(item: Installment) {
  if (item.status !== 'paga') throw new Error('A parcela não está paga.')
  // O CHECK no PostgreSQL exige limpar ambos os campos ao retornar para pendente.
  return changeInstallment(item.id, { status: 'pendente', paid_at: null, paid_amount: null, payment_method: null, reference: null })
}

export async function cancelInstallment(item: Installment) {
  if (item.status !== 'pendente') throw new Error('Apenas parcelas pendentes podem ser canceladas.')
  return changeInstallment(item.id, { status: 'cancelada' })
}
