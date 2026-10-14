import { supabase } from '@/lib/supabase'

export type DashboardSummary = {
  active_clients: number
  active_policy_records: number
  current_policies: number
  expired_policies: number
  overdue_installments: number
  overdue_amount: number
}

export async function fetchDashboard(): Promise<DashboardSummary> {
  // A Edge Function existente aceita GET e retorna { data: dashboard_summary }.
  const { data, error } = await supabase.functions.invoke('insurance-dashboard', { method: 'GET' })
  if (error) throw new Error(`Não foi possível consultar os indicadores: ${error.message}`)
  if (!data || typeof data !== 'object' || !data.data) throw new Error('Resposta inesperada da Edge Function.')
  const result = data.data as Record<string, unknown>
  const fields: (keyof DashboardSummary)[] = ['active_clients','active_policy_records','current_policies','expired_policies','overdue_installments','overdue_amount']
  for (const field of fields) {
    if (result[field] === null || result[field] === undefined || !Number.isFinite(Number(result[field]))) throw new Error(`Campo inválido na resposta: ${field}`)
  }
  return Object.fromEntries(fields.map(field => [field, Number(result[field])])) as DashboardSummary
}
