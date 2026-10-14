import { supabase } from '@/lib/supabase'

export type DocumentKind = 'apolice' | 'endosso' | 'proposta' | 'comprovante' | 'identificacao' | 'outro'
export type DocumentOwner = 'client_id' | 'policy_id' | 'insured_person_id'
export type InsuranceDocument = {
  id: string
  client_id: string | null
  policy_id: string | null
  insured_person_id: string | null
  kind: DocumentKind
  file_name: string
  storage_path: string
  mime_type: string | null
  size_bytes: number | null
  description: string | null
  is_active: boolean
  created_at: string
}
export type RefRow = { id: string; label: string }
type Page<T> = { data: T[]; pagination: { total: number; offset: number; limit: number } }

async function api<T>(path: string, method: 'GET'|'POST'|'PATCH', body?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(`insurance-api/${path}`, { method, ...(body ? { body } : {}) })
  if (error) {
    const response = (error as { context?: Response }).context
    if (response?.clone) {
      const payload = await response.clone().json().catch(() => null) as { error?: string; message?: string } | null
      if (payload?.error || payload?.message) throw new Error(payload.error || payload.message)
    }
    throw new Error(error.message)
  }
  return data as T
}

export async function documentsPage(offset = 0, limit = 20, owner?: DocumentOwner, ownerId?: string) {
  const params = new URLSearchParams({ offset: String(offset), limit: String(limit) })
  if (owner && ownerId) params.set(owner, ownerId)
  return api<Page<InsuranceDocument>>(`documents?${params.toString()}`, 'GET')
}

export async function allReferences(resource: 'clients'|'policies'|'insured_persons') {
  const rows: Record<string, unknown>[] = []
  for (let offset = 0; offset < 5000; offset += 100) {
    const page = await api<Page<Record<string, unknown>>>(`${resource}?offset=${offset}&limit=100&active=true`, 'GET')
    rows.push(...page.data)
    if (!page.data.length || offset + page.data.length >= page.pagination.total) return rows
  }
  throw new Error('Muitos registros: será necessária busca paginada por servidor.')
}

const accepted = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
const maxSize = 20 * 1024 * 1024

function safeFileName(name: string): string {
  // Guarda o nome legível no banco, e utiliza apenas ASCII seguro no Storage.
  const extension = name.split('.').pop()?.toLowerCase() || 'bin'
  const stem = name.replace(/\.[^.]+$/, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_').replace(/^_+|_+$/g, '').slice(0, 85) || 'arquivo'
  return `${stem}.${extension}`
}

export async function uploadDocument(file: File, owner: DocumentOwner, ownerId: string, kind: DocumentKind, description: string) {
  if (!ownerId) throw new Error('Selecione o registro ao qual o arquivo pertence.')
  if (!accepted.includes(file.type)) throw new Error('Formato não permitido: envie PDF, JPG, PNG ou WebP.')
  if (!file.size || file.size > maxSize) throw new Error('O arquivo deve ter até 20 MB.')
  const safeName = safeFileName(file.name)
  const signed = await api<{path: string; token: string}>(`documents/upload-url`, 'POST', {
    file_name: safeName, mime_type: file.type,
  })
  const { error } = await supabase.storage.from('insurance-documents')
    .uploadToSignedUrl(signed.path, signed.token, file, { contentType: file.type, upsert: false })
  if (error) throw new Error(`Falha no envio ao Storage: ${error.message}`)
  // Se essa gravação falhar, pode restar um arquivo órfão no Storage.
  // Não apagamos automaticamente, pois a política permite DELETE apenas ao gestor.
  const result = await api<{data: InsuranceDocument}>('documents', 'POST', {
    [owner]: ownerId, kind, file_name: file.name.slice(0, 240), storage_path: signed.path,
    mime_type: file.type, size_bytes: file.size, description: description.trim() || null,
  })
  return result.data
}

export async function downloadDocument(doc: InsuranceDocument) {
  const { url } = await api<{url: string; expires_in: number}>(`documents/${doc.id}/download-url`, 'POST')
  // Link assinado temporário: nunca armazenar em banco ou logs.
  window.open(url, '_blank', 'noopener,noreferrer')
}

export async function changeDocument(id: string, values: { description?: string|null; is_active?: boolean }) {
  return (await api<{data: InsuranceDocument}>(`documents/${id}`, 'PATCH', values)).data
}
