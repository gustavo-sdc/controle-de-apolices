import { supabase } from '@/lib/supabase'

export type ManagedUser = {
  id: string
  full_name: string
  role: 'gestor' | 'editor'
  is_active: boolean
  created_at: string
  created_by: string | null
}
type ListResponse = { data: ManagedUser[]; pagination: { total: number; limit: number; offset: number } }
type OneResponse = { data: ManagedUser; email?: string; message?: string }

async function request<T>(path: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', body?: object): Promise<T> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (sessionError || !sessionData.session) throw new Error('Sua sessão expirou. Entre novamente.')
  const { data, error } = await supabase.functions.invoke(`insurance-users${path}`, {
    method,
    ...(body ? { body } : {}),
    headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
  })
  if (error) {
    const response = (error as { context?: Response }).context
    if (response && typeof response.clone === 'function') {
      const payload = await response.clone().json().catch(() => null) as { error?: string; message?: string } | null
      if (payload?.error || payload?.message) throw new Error(payload.error || payload.message)
    }
    throw new Error(error.message || 'Não foi possível concluir a solicitação.')
  }
  return data as T
}

export function getUsers(offset = 0, limit = 20) {
  return request<ListResponse>(`?offset=${offset}&limit=${limit}`, 'GET')
}
export function createEditor(values: { full_name: string; email: string; password: string }) {
  return request<OneResponse>('', 'POST', values)
}
export function updateEditor(id: string, values: { full_name?: string; is_active?: boolean }) {
  return request<OneResponse>(`/${encodeURIComponent(id)}`, 'PATCH', values)
}
export function deleteEditor(id: string) {
  return request<{ success: boolean }>(`/${encodeURIComponent(id)}`, 'DELETE')
}
