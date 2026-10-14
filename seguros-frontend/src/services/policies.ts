import { supabase } from '@/lib/supabase'
import type { Client, Person } from '@/services/clients'

export type PolicyStatus = 'rascunho' | 'ativa' | 'suspensa' | 'cancelada' | 'encerrada'
export type Relation = 'titular' | 'segurado' | 'dependente'
export type Policy = {
  id: string; client_id: string; policy_number: string; proposal_number: string | null
  insurer_name: string; broker_name: string | null; product_name: string | null
  insurance_type: string; description: string | null; effective_from: string; effective_until: string
  issue_date: string | null; coverage_amount: number | null; premium_amount: number | null
  deductible_amount: number | null; currency: string; status: PolicyStatus
  cancellation_reason: string | null; notes: string | null; is_active: boolean; created_at: string
}
export type Insured = { id: string; person_id: string; notes: string | null; is_active: boolean }
export type PolicyMember = {
  id: string; policy_id: string; insured_person_id: string; relation: Relation
  responsible_insured_id: string | null; notes: string | null; is_active: boolean
}
export type PolicyForm = {
  client_id: string; policy_number: string; proposal_number: string; insurer_name: string
  broker_name: string; product_name: string; insurance_type: string; description: string
  effective_from: string; effective_until: string; issue_date: string
  coverage_amount: string; premium_amount: string; deductible_amount: string; notes: string
}
export const blankPolicy: PolicyForm = {
  client_id: '', policy_number: '', proposal_number: '', insurer_name: '', broker_name: '',
  product_name: '', insurance_type: '', description: '', effective_from: '', effective_until: '',
  issue_date: '', coverage_amount: '', premium_amount: '', deductible_amount: '', notes: '',
}

type Collection<T> = { data: T[]; pagination: { total: number; limit: number; offset: number } }

async function invoke<T>(path: string, method: 'GET' | 'POST' | 'PATCH', payload?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(`insurance-api/${path}`, {
    method, ...(payload ? { body: payload } : {}),
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
const optional = (s: string) => s.trim() || null
function money(value: string) {
  if (!value.trim()) return null
  const number = Number(value.replace(',', '.'))
  if (!Number.isFinite(number) || number < 0) throw new Error('Valores financeiros devem ser números positivos.')
  return number
}
export async function listPolicies(offset = 0, limit = 20) {
  return invoke<Collection<Policy>>(`policies?limit=${limit}&offset=${offset}`, 'GET')
}
export async function getPolicy(id: string) { return (await invoke<{ data: Policy }>(`policies/${id}`, 'GET')).data }
export async function listAll<T>(resource: 'clients' | 'people' | 'insured_persons' | 'policy_insured_persons', filter?: string): Promise<T[]> {
  const found: T[] = []
  for (let offset = 0; ; offset += 100) {
    const page = await invoke<Collection<T>>(`${resource}?limit=100&offset=${offset}${filter ? `&${filter}` : ''}`, 'GET')
    found.push(...page.data)
    if (found.length >= page.pagination.total || page.data.length === 0) break
    if (found.length > 5000) throw new Error('Limite de registros excedido. É necessário implementar busca no servidor.')
  }
  return found
}
export async function getPeopleMap() {
  const people = await listAll<Person>('people')
  return Object.fromEntries(people.map(p => [p.id, p])) as Record<string, Person>
}
export async function getClientMap() {
  const clients = await listAll<Client>('clients')
  return Object.fromEntries(clients.map(c => [c.id, c])) as Record<string, Client>
}
export async function savePolicy(form: PolicyForm, existing?: Policy) {
  if (!form.client_id || !form.policy_number.trim() || !form.insurer_name.trim() || !form.insurance_type.trim() || !form.effective_from || !form.effective_until) {
    throw new Error('Preencha cliente, número, seguradora, ramo e datas de vigência.')
  }
  if (form.effective_until < form.effective_from) throw new Error('A data final não pode ser anterior à inicial.')
  const input = {
    policy_number: form.policy_number.trim(), proposal_number: optional(form.proposal_number),
    insurer_name: form.insurer_name.trim(), broker_name: optional(form.broker_name),
    product_name: optional(form.product_name), insurance_type: form.insurance_type.trim(),
    description: optional(form.description), effective_from: form.effective_from,
    effective_until: form.effective_until, issue_date: optional(form.issue_date),
    coverage_amount: money(form.coverage_amount), premium_amount: money(form.premium_amount),
    deductible_amount: money(form.deductible_amount), notes: optional(form.notes),
  }
  const response = await invoke<{ data: Policy }>(existing ? `policies/${existing.id}` : 'policies', existing ? 'PATCH' : 'POST', existing ? input : { ...input, client_id: form.client_id, status: 'rascunho' })
  return response.data
}
export async function patchPolicy(id: string, changes: Record<string, unknown>) {
  return (await invoke<{ data: Policy }>(`policies/${id}`, 'PATCH', changes)).data
}
export async function listMembers(policyId: string) {
  return listAll<PolicyMember>('policy_insured_persons', `policy_id=${encodeURIComponent(policyId)}`)
}
export async function getInsuredPerson(personId: string): Promise<Insured> {
  const records = await listAll<Insured>('insured_persons', `person_id=${encodeURIComponent(personId)}`)
  if (records[0]) {
    if (!records[0].is_active) return (await invoke<{ data: Insured }>(`insured_persons/${records[0].id}`, 'PATCH', { is_active: true })).data
    return records[0]
  }
  return (await invoke<{ data: Insured }>('insured_persons', 'POST', { person_id: personId })).data
}
export async function ensurePrincipal(policy: Policy, client: Client) {
  if (client.kind !== 'pf' || !client.person_id) return
  const members = await listMembers(policy.id)
  const insured = await getInsuredPerson(client.person_id)
  const existing = members.find(m => m.insured_person_id === insured.id)
  if (existing) {
    if (!existing.is_active || existing.relation !== 'titular') await invoke(`policy_insured_persons/${existing.id}`, 'PATCH', { relation: 'titular', is_active: true, responsible_insured_id: null })
  } else await invoke('policy_insured_persons', 'POST', { policy_id: policy.id, insured_person_id: insured.id, relation: 'titular' })
}
export async function attachMember(policyId: string, personId: string, relation: Exclude<Relation, 'titular'>, responsibleId: string | null, existingMembers: PolicyMember[]) {
  const insured = await getInsuredPerson(personId)
  const existing = existingMembers.find(m => m.insured_person_id === insured.id)
  const payload = { relation, responsible_insured_id: relation === 'dependente' ? responsibleId : null, is_active: true }
  if (existing) return invoke(`policy_insured_persons/${existing.id}`, 'PATCH', payload)
  return invoke('policy_insured_persons', 'POST', { policy_id: policyId, insured_person_id: insured.id, ...payload })
}
export async function deactivateMember(memberId: string) {
  return invoke(`policy_insured_persons/${memberId}`, 'PATCH', { is_active: false })
}
export async function createPerson(fullName: string, cpf: string) {
  const sanitized = cpf.replace(/\D/g, '')
  if (!fullName.trim()) throw new Error('Informe o nome da pessoa.')
  if (sanitized && sanitized.length !== 11) throw new Error('CPF deve conter 11 dígitos.')
  const response = await invoke<{ data: Person }>('people', 'POST', { full_name: fullName.trim(), cpf: sanitized || null })
  return response.data
}
