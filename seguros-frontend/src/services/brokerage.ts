import { supabase } from '@/lib/supabase'

export type BrokerageRow = {
  id: string
  policy_id: string
  policy_number: string
  insurer_name: string
  installment_number: number
  amount: number
  due_date: string
  status: 'pendente' | 'recebida' | 'cancelada'
  received_at: string | null
  received_amount: number | null
  is_overdue: boolean
}

export type BrokerageMonth = {
  month: string
  expected_amount: number
  received_amount: number
  pending_installments: number
  received_installments: number
}

export async function getBrokerageOverview(): Promise<{ rows: BrokerageRow[]; monthly: BrokerageMonth[] }> {
  // Paginar em lotes para evitar truncamento silencioso pelo limite de linhas do PostgREST.
  const rows: BrokerageRow[] = []
  const pageSize = 500
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('brokerage_receivables_overview')
      .select('*')
      .order('due_date', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throw new Error(error.message)
    const batch = (data ?? []) as BrokerageRow[]
    rows.push(...batch)
    if (batch.length < pageSize) break
  }
  // Resumo derivado da MESMA lista que alimenta os indicadores.
  // Assim não dependemos de duas consultas feitas em momentos diferentes.
  const byMonth = new Map<string, BrokerageMonth>()
  const getMonth = (value: string) => {
    const month = value.slice(0, 7) + '-01'
    let current = byMonth.get(month)
    if (!current) {
      current = { month, expected_amount: 0, received_amount: 0,
        pending_installments: 0, received_installments: 0 }
      byMonth.set(month, current)
    }
    return current
  }
  for (const row of rows) {
    if (row.status !== 'cancelada') {
      const planned = getMonth(row.due_date)
      planned.expected_amount += Number(row.amount)
      if (row.status === 'pendente') planned.pending_installments++
    }
    if (row.status === 'recebida' && row.received_at) {
      const received = getMonth(row.received_at)
      received.received_amount += Number(row.received_amount ?? 0)
      received.received_installments++
    }
  }
  return { rows, monthly: [...byMonth.values()].sort((a,b) => a.month.localeCompare(b.month)) }
}

export async function registerBrokerageReceipt(id: string, received: boolean) {
  const { error } = await supabase.functions.invoke(`insurance-financials/receivable/${id}/receipt`, {
    method: 'POST', body: { received },
  })
  if (error) {
    const response = (error as { context?: Response }).context
    const details = response?.clone
      ? await response.clone().json().catch(() => null) as { error?: string; message?: string } | null
      : null
    throw new Error(details?.error ?? details?.message ?? error.message)
  }
}
