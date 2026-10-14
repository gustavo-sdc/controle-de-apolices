import { supabase } from '@/lib/supabase'

export type PaymentMethod = 'cartao_parcelado'|'debito_automatico_parcelado'|'boleto_parcelado'|'cartao_a_vista'|'debito'|'pix'
export type FinancialInput = {
  net_premium: number; payment_method: PaymentMethod; client_installments: number;
  interest_applies: boolean; interest_amount: number; first_due_date: string;
  agency_percentage: number; agency_installments: number; agency_first_date: string
}
type Installment = { id: string; installment_number: number; amount: number; due_date: string; status: string; paid_at?: string|null }
export type FinancialDetail = {
  policy: { id: string; policy_number: string; premium_amount: number|null; net_premium_amount: number|null; coverage_amount: number|null; deductible_amount: number|null }
  payment: { payment_method: PaymentMethod; installments: number; interest_applies: boolean; interest_amount: number; first_due_date: string }|null
  agreement: { agency_percentage: number; installments: number; first_receipt_date: string }|null
  client_schedule: Installment[]; agency_schedule: Installment[]
}
export type MonthlySummary = { month: string; expected_amount: number; received_amount: number; pending_installments: number; received_installments: number }
async function request<T>(path: string, method: 'GET'|'PATCH'|'POST' = 'GET', payload?: object): Promise<T> {
  const { data, error } = await supabase.functions.invoke('insurance-financials/'+path, {
    method, ...(payload ? { body: payload } : {}),
  })
  if (error) {
    const response = (error as {context?: Response}).context
    if (response?.clone) {
      const detail = await response.clone().json().catch(()=>null) as {error?: string; message?:string}|null
      if (detail?.error || detail?.message) throw new Error(detail.error || detail.message)
    }
    throw new Error(error.message + ' (confira Network e Logs da Edge Function)')
  }
  return data as T
}
export const financialDetail = (id: string) => request<FinancialDetail>('policy/'+id)
export const saveFinancials = (id: string, payload: FinancialInput) => request<{success:boolean}>('policy/'+id,'PATCH',payload)
export const monthlyBrokerage = async () => (await request<{data: MonthlySummary[]}>('monthly')).data
export const setReceipt = (id: string, received: boolean) => request<{success:boolean}>(`receivable/${id}/receipt`,'POST',{received})

export const saveBrokerage = (id: string, input: FinancialInput) =>
  request<{success:boolean}>(`policy/${id}/brokerage`, 'PATCH', {
    net_premium: input.net_premium, agency_percentage: input.agency_percentage,
    agency_installments: input.agency_installments, agency_first_date: input.agency_first_date,
  })
