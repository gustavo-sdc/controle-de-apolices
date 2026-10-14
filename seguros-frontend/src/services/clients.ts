import { supabase } from '@/lib/supabase'

export type Person = { id: string; full_name: string; cpf: string | null; birth_date: string | null; email: string | null; phone: string | null; mobile_phone: string | null; occupation: string | null; notes: string | null; is_active: boolean }
export type Client = { id: string; kind: 'pf' | 'pj'; person_id: string | null; company_name: string | null; trade_name: string | null; cnpj: string | null; contact_name: string | null; email: string | null; phone: string | null; city: string | null; state_code: string | null; notes: string | null; is_active: boolean; created_at: string }
export type ClientFormValues = { kind: 'pf' | 'pj'; full_name: string; cpf: string; company_name: string; trade_name: string; cnpj: string; contact_name: string; email: string; phone: string; city: string; state_code: string; notes: string }
type List<T> = { data: T[]; pagination: { total: number; limit: number; offset: number } }
const digits = (s: string) => s.replace(/\D/g, '')
const emptyNull = (s: string) => s.trim() || null

async function invoke<T>(path: string, method: 'GET' | 'POST' | 'PATCH', body?: object): Promise<T> {
  const { data, error } = await supabase.functions.invoke(`insurance-api/${path}`, { method, ...(body ? { body } : {}) })
  if (error) {
    // FunctionsHttpError guarda a resposta HTTP real em context.
    const context = (error as { context?: Response }).context
    if (context && typeof context.json === 'function') {
      try { const detail = await context.json(); if (typeof detail?.error === 'string') throw new Error(detail.error) }
      catch (e) { if (e instanceof Error && e.message !== 'Unexpected end of JSON input' && !(e instanceof SyntaxError)) throw e }
    }
    throw new Error(error.message)
  }
  return data as T
}
export async function listClients(offset = 0, limit = 20) {
  return invoke<List<Client>>(`clients?offset=${offset}&limit=${limit}`, 'GET')
}
export async function listPeople(offset = 0, limit = 100) {
  return invoke<List<Person>>(`people?offset=${offset}&limit=${limit}`, 'GET')
}
export async function getPerson(id: string) { return (await invoke<{ data: Person }>(`people/${id}`, 'GET')).data }
export async function getClient(id: string) { return (await invoke<{ data: Client }>(`clients/${id}`, 'GET')).data }
export async function saveClient(values: ClientFormValues, existing?: Client): Promise<Client> {
  const shared = { email: emptyNull(values.email), phone: emptyNull(values.phone), city: emptyNull(values.city), state_code: emptyNull(values.state_code.toUpperCase()), notes: emptyNull(values.notes) }
  if (values.kind === 'pf') {
    if (!values.full_name.trim()) throw new Error('Informe o nome completo.')
    const cpf = digits(values.cpf)
    if (cpf && cpf.length !== 11) throw new Error('CPF deve conter 11 dígitos.')
    if (existing && existing.kind !== 'pf') throw new Error('Não é permitido alterar o tipo de cliente.')
    let personId = existing?.person_id
    if (personId) {
      await invoke(`people/${personId}`, 'PATCH', { full_name: values.full_name.trim(), cpf: cpf || null })
    } else {
      // A API atual não fornece transação entre people e clients.
      const created = await invoke<{ data: Person }>('people', 'POST', { full_name: values.full_name.trim(), cpf: cpf || null })
      personId = created.data.id
    }
    const payload = { ...shared, kind: 'pf', person_id: personId }
    const result = await invoke<{ data: Client }>(existing ? `clients/${existing.id}` : 'clients', existing ? 'PATCH' : 'POST', existing ? shared : payload)
    return result.data
  }
  if (!values.company_name.trim()) throw new Error('Informe a razão social.')
  const cnpj = digits(values.cnpj)
  if (cnpj.length !== 14) throw new Error('CNPJ deve conter 14 dígitos.')
  if (existing && existing.kind !== 'pj') throw new Error('Não é permitido alterar o tipo de cliente.')
  const payload = { ...shared, company_name: values.company_name.trim(), trade_name: emptyNull(values.trade_name), cnpj, contact_name: emptyNull(values.contact_name) }
  const result = await invoke<{ data: Client }>(existing ? `clients/${existing.id}` : 'clients', existing ? 'PATCH' : 'POST', existing ? payload : { ...payload, kind: 'pj' })
  return result.data
}
export async function setClientActive(id: string, is_active: boolean) {
  return (await invoke<{ data: Client }>(`clients/${id}`, 'PATCH', { is_active })).data
}
