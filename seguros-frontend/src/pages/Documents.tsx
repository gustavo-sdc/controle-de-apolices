import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Download, FilePlus2, FileText, RefreshCw } from 'lucide-react'
import { allReferences, changeDocument, documentsPage, downloadDocument, uploadDocument,
  type DocumentKind, type DocumentOwner, type InsuranceDocument, type RefRow } from '@/services/documents'

const kinds: { value: DocumentKind; label: string }[] = [
  {value:'apolice',label:'Apólice'}, {value:'endosso',label:'Endosso'}, {value:'proposta',label:'Proposta'},
  {value:'comprovante',label:'Comprovante'}, {value:'identificacao',label:'Identificação'}, {value:'outro',label:'Outro'},
]
const owners: { value: DocumentOwner; label: string }[] = [
  {value:'client_id',label:'Cliente'}, {value:'policy_id',label:'Apólice'}, {value:'insured_person_id',label:'Segurado'},
]
const formatDate = (s: string) => new Date(s).toLocaleDateString('pt-BR')
const formatSize = (s: number | null) => s == null ? '—' : `${(s / 1024 / 1024).toFixed(2)} MB`
const cls = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100'

export default function Documents() {
  const [records, setRecords] = useState<InsuranceDocument[]>([])
  const [offset, setOffset] = useState(0)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [revision, setRevision] = useState(0)
  const [showForm, setShowForm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [owner, setOwner] = useState<DocumentOwner>('policy_id')
  const [ownerId, setOwnerId] = useState('')
  const [references, setReferences] = useState<RefRow[]>([])
  const [loadingReferences, setLoadingReferences] = useState(false)
  const [kind, setKind] = useState<DocumentKind>('apolice')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState<File | null>(null)

  const refresh = useCallback(() => setRevision(x => x + 1), [])
  useEffect(() => {
    let cancelled = false
    documentsPage(offset, 20)
      .then(page => { if (!cancelled) {setRecords(page.data); setTotal(page.pagination.total); setError('')} })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Erro ao consultar documentos') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [offset, revision])

  useEffect(() => {
    let cancelled = false
    const resources = {client_id:'clients',policy_id:'policies',insured_person_id:'insured_persons'} as const
    allReferences(resources[owner]).then(rows => {
      if (cancelled) return
      setReferences(rows.map(row => ({ id: String(row.id), label: String(
        row.company_name || row.policy_number || row.person_id || row.id
      ) })) )
    }).catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Falha ao carregar vínculos') })
      .finally(() => { if (!cancelled) setLoadingReferences(false) })
    return () => { cancelled = true }
  }, [owner])

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!file) return setError('Selecione um arquivo.')
    setBusy(true); setError(''); setNotice('')
    try {
      await uploadDocument(file, owner, ownerId, kind, description)
      setNotice('Documento enviado com sucesso.'); setShowForm(false); setFile(null); setDescription('')
      setOffset(0); refresh()
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha no upload') }
    finally { setBusy(false) }
  }

  async function action(work: () => Promise<unknown>, success: string) {
    setBusy(true); setError(''); setNotice('')
    try { await work(); setNotice(success); refresh() }
    catch (e) { setError(e instanceof Error ? e.message : 'Operação não concluída') }
    finally { setBusy(false) }
  }

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div><h1 className="text-2xl font-bold tracking-tight text-slate-900">Documentos</h1>
        <p className="mt-1 text-sm text-slate-500">Arquivos privados vinculados a clientes, apólices e segurados.</p></div>
      <button className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800" onClick={() => setShowForm(x => !x)}>
        <FilePlus2 size={17}/> {showForm ? 'Fechar formulário' : 'Novo documento'}</button>
    </div>
    {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
    {showForm && <form onSubmit={e => void submit(e)} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold">Enviar documento</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1 text-sm font-medium">Vincular a
          <select className={cls} value={owner} onChange={e => {setOwner(e.target.value as DocumentOwner); setOwnerId(''); setReferences([]); setLoadingReferences(true)}}>
            {owners.map(x => <option key={x.value} value={x.value}>{x.label}</option>)}
          </select></label>
        <label className="space-y-1 text-sm font-medium">Registro
          <select className={cls} required value={ownerId} onChange={e => setOwnerId(e.target.value)} disabled={loadingReferences}>
            <option value="">{loadingReferences ? 'Carregando registros...' : 'Selecione...'}</option>
            {references.map(x => <option value={x.id} key={x.id}>{x.label}</option>)}
          </select></label>
        <label className="space-y-1 text-sm font-medium">Tipo de documento
          <select className={cls} value={kind} onChange={e => setKind(e.target.value as DocumentKind)}>{kinds.map(x => <option value={x.value} key={x.value}>{x.label}</option>)}</select></label>
        <label className="space-y-1 text-sm font-medium">Arquivo (até 20 MB)
          <input className={cls} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" required onChange={e => setFile(e.target.files?.[0] || null)}/></label>
      </div>
      <label className="block space-y-1 text-sm font-medium">Descrição (opcional)
        <textarea className={cls} rows={2} value={description} onChange={e => setDescription(e.target.value)} /></label>
      <button disabled={busy || !ownerId || !file} type="submit" className="rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Enviando...' : 'Salvar documento'}</button>
    </form>}
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 p-4"><span className="text-sm font-semibold text-slate-700">Arquivos cadastrados ({total})</span>
        <button className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50" onClick={refresh}><RefreshCw size={16}/> Atualizar</button></div>
      <div className="overflow-x-auto"><table className="min-w-[750px] w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>
        <th className="p-4">Documento</th><th className="p-4">Categoria</th><th className="p-4">Tamanho</th><th className="p-4">Data</th><th className="p-4">Situação</th><th className="p-4">Ações</th>
      </tr></thead><tbody className="divide-y divide-slate-100">
        {records.map(doc => <tr key={doc.id} className="hover:bg-slate-50"><td className="p-4"><div className="flex items-center gap-2 font-medium"><FileText size={17} className="text-blue-700"/><span className="max-w-52 truncate" title={doc.file_name}>{doc.file_name}</span></div>{doc.description && <p className="mt-1 max-w-60 truncate text-xs text-slate-500">{doc.description}</p>}</td>
          <td className="p-4 capitalize">{doc.kind}</td><td className="p-4">{formatSize(doc.size_bytes)}</td><td className="p-4">{formatDate(doc.created_at)}</td><td className="p-4">{doc.is_active ? 'Ativo' : 'Inativo'}</td><td className="p-4"><div className="flex items-center gap-2">
            {doc.is_active && <button disabled={busy} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 hover:bg-slate-50" onClick={() => void action(() => downloadDocument(doc), 'Link temporário de acesso solicitado.')}><Download size={14}/> Abrir</button>}
            <button disabled={busy} className="rounded-md border px-2 py-1 hover:bg-slate-50" onClick={() => void action(() => changeDocument(doc.id, {is_active: !doc.is_active}), 'Situação atualizada.')}>{doc.is_active ? 'Desativar' : 'Reativar'}</button>
          </div></td></tr>)}
        {!loading && records.length === 0 && <tr><td colSpan={6} className="p-12 text-center text-slate-500">Nenhum documento encontrado.</td></tr>}
        {loading && <tr><td colSpan={6} className="p-12 text-center text-slate-500">Carregando documentos...</td></tr>}
      </tbody></table></div>
      <div className="flex items-center justify-between border-t border-slate-200 p-4"><span className="text-xs text-slate-500">{total ? `${offset + 1}–${Math.min(offset + 20, total)} de ${total}` : 'Nenhum resultado'}</span>
        <div className="flex gap-2"><button className="rounded-md border px-3 py-2 text-sm disabled:opacity-40" disabled={offset === 0 || loading} onClick={() => {setLoading(true); setOffset(x => Math.max(0, x-20))}}>Anterior</button>
        <button className="rounded-md border px-3 py-2 text-sm disabled:opacity-40" disabled={offset + 20 >= total || loading} onClick={() => {setLoading(true); setOffset(x => x+20)}}>Próximo</button></div></div>
    </div>
  </div>
}
