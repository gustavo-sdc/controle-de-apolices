import { useEffect, useState, type FormEvent } from 'react'
import { CheckCircle2, Pencil, Plus, RefreshCcw, Search, Shield, Trash2, UserRoundX, X } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { createEditor, deleteEditor, getUsers, updateEditor, type ManagedUser } from '@/services/users'

const field = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100'
const button = 'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50'
const date = (value: string) => new Date(value).toLocaleDateString('pt-BR')
type DialogMode = 'create' | 'edit'

export default function Users() {
  const { profile } = useAuth()
  const [items, setItems] = useState<ManagedUser[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [revision, setRevision] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [mode, setMode] = useState<DialogMode | null>(null)
  const [editing, setEditing] = useState<ManagedUser | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  useEffect(() => {
    let cancelled = false
    getUsers(offset).then(result => {
      if (cancelled) return
      setItems(result.data)
      setTotal(result.pagination.total)
      setError('')
    }).catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Erro ao carregar usuários') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [offset, revision])

  if (profile?.role !== 'gestor') {
    return <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-700">Apenas gestores podem acessar usuários.</div>
  }

  const editors = items.filter(u => u.role === 'editor')
  const filtered = editors.filter(u => `${u.full_name} ${u.id}`.toLowerCase().includes(search.trim().toLowerCase()))
  function reload() { setLoading(true); setRevision(x => x + 1) }
  function close() { setMode(null); setEditing(null); setPassword('') }
  function startCreate() { setError(''); setName(''); setEmail(''); setPassword(''); setEditing(null); setMode('create') }
  function startEdit(item: ManagedUser) { setError(''); setName(item.full_name); setEmail(''); setPassword(''); setEditing(item); setMode('edit') }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true); setError(''); setNotice('')
    try {
      if (!name.trim()) throw new Error('Informe o nome do editor.')
      if (mode === 'create') {
        if (password.length < 12 || password.length > 128) throw new Error('A senha precisa ter de 12 a 128 caracteres.')
        const created = await createEditor({ full_name: name.trim(), email: email.trim(), password })
        setNotice(created.message || 'Editor criado. Verifique o e-mail de confirmação antes do primeiro login.')
      } else if (editing) {
        await updateEditor(editing.id, { full_name: name.trim() })
        setNotice('Editor atualizado com sucesso.')
      }
      close(); reload()
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha ao salvar editor') }
    finally { setBusy(false) }
  }

  async function toggle(item: ManagedUser) {
    if (!window.confirm(`${item.is_active ? 'Desativar' : 'Reativar'} o editor ${item.full_name}?`)) return
    setBusy(true); setError(''); setNotice('')
    try {
      await updateEditor(item.id, { is_active: !item.is_active })
      setNotice(item.is_active ? 'Editor desativado.' : 'Editor reativado.')
      reload()
    } catch (e) { setError(e instanceof Error ? e.message : 'Erro ao alterar o acesso') }
    finally { setBusy(false) }
  }
  async function remove(item: ManagedUser) {
    if (item.is_active) return setError('Desative o editor antes de excluí-lo.')
    if (!window.confirm(`Excluir definitivamente ${item.full_name}? Esta operação remove também a conta de autenticação e não pode ser desfeita.`)) return
    setBusy(true); setError(''); setNotice('')
    try {
      await deleteEditor(item.id)
      setNotice('Editor excluído.'); reload()
    } catch (e) { setError(e instanceof Error ? e.message : 'Erro ao excluir editor') }
    finally { setBusy(false) }
  }

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div><h1 className="text-2xl font-bold tracking-tight text-slate-900">Usuários e permissões</h1><p className="mt-1 text-sm text-slate-500">Gerencie os editores que acessam o sistema.</p></div>
      <button className={`${button} bg-blue-700 text-white hover:bg-blue-800`} onClick={startCreate}><Plus size={17}/> Novo editor</button>
    </div>
    {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    {notice && <div role="status" className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{notice}</div>}
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-medium text-slate-500">Usuários nesta página</p><p className="mt-2 text-2xl font-bold">{items.length}</p></div>
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-medium text-slate-500">Editores ativos nesta página</p><p className="mt-2 text-2xl font-bold text-green-700">{editors.filter(x => x.is_active).length}</p></div>
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-medium text-slate-500">Total de usuários</p><p className="mt-2 text-2xl font-bold">{total}</p></div>
    </div>
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
        <div className="relative w-full max-w-sm"><Search className="absolute left-3 top-3 text-slate-400" size={17}/><input aria-label="Pesquisar editores nesta página" className={`${field} pl-9`} value={search} onChange={e => setSearch(e.target.value)} placeholder="Pesquisar editores nesta página"/></div>
        <button className={`${button} border border-slate-200 text-slate-700 hover:bg-slate-50`} onClick={reload} disabled={busy || loading}><RefreshCcw size={16}/> Atualizar</button>
      </div>
      <div className="overflow-x-auto"><table className="w-full min-w-[770px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-4">Usuário</th><th className="p-4">Permissão</th><th className="p-4">Situação</th><th className="p-4">Criado em</th><th className="p-4">Ações</th></tr></thead>
        <tbody className="divide-y divide-slate-100">
          {filtered.map(u => <tr key={u.id} className="hover:bg-slate-50"><td className="p-4 font-semibold text-slate-900">{u.full_name}<p className="mt-1 font-normal text-xs text-slate-400" title={u.id}>{u.id.slice(0,8)}…</p></td>
            <td className="p-4"><span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700"><Shield size={13}/> Editor</span></td>
            <td className="p-4">{u.is_active ? <span className="inline-flex items-center gap-1 text-green-700"><CheckCircle2 size={15}/> Ativo</span> : <span className="inline-flex items-center gap-1 text-slate-500"><UserRoundX size={15}/> Inativo</span>}</td>
            <td className="p-4 text-slate-600">{date(u.created_at)}</td>
            <td className="p-4"><div className="flex flex-wrap gap-2"><button disabled={busy} title="Editar" className="rounded-md border border-slate-200 p-2 hover:bg-slate-100 disabled:opacity-50" onClick={() => startEdit(u)}><Pencil size={15}/></button>
              <button disabled={busy} className="rounded-md border border-slate-200 px-2 py-1 text-xs hover:bg-slate-100 disabled:opacity-50" onClick={() => void toggle(u)}>{u.is_active ? 'Desativar' : 'Reativar'}</button>
              {!u.is_active && <button disabled={busy} title="Excluir" className="rounded-md border border-red-200 p-2 text-red-700 hover:bg-red-50 disabled:opacity-50" onClick={() => void remove(u)}><Trash2 size={15}/></button>}</div></td></tr>)}
          {loading && <tr><td colSpan={5} className="p-10 text-center text-slate-500">Carregando usuários...</td></tr>}
          {!loading && filtered.length === 0 && <tr><td colSpan={5} className="p-10 text-center text-slate-500">Nenhum editor encontrado nesta página.</td></tr>}
        </tbody></table></div>
      <div className="flex items-center justify-between border-t border-slate-200 p-4 text-sm"><span className="text-slate-500">{total ? `${offset + 1}–${Math.min(offset + 20, total)} de ${total}` : 'Nenhum usuário'}</span><div className="flex gap-2"><button className="rounded-lg border px-3 py-2 disabled:opacity-40" disabled={offset === 0 || loading} onClick={() => {setLoading(true);setOffset(x => Math.max(0,x-20))}}>Anterior</button><button className="rounded-lg border px-3 py-2 disabled:opacity-40" disabled={offset + 20 >= total || loading} onClick={() => {setLoading(true);setOffset(x => x+20)}}>Próximo</button></div></div>
    </div>
    {mode && <div role="presentation" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><div role="dialog" aria-modal="true" aria-labelledby="editor-title" className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
      <div className="flex items-center justify-between"><h2 id="editor-title" className="text-lg font-bold">{mode === 'create' ? 'Novo editor' : 'Editar editor'}</h2><button onClick={close} aria-label="Fechar" disabled={busy}><X size={20}/></button></div>
      <p className="mt-1 text-sm text-slate-500">{mode === 'create' ? 'A nova conta terá permissão de editor.' : 'Atualize o nome do editor.'}</p>
      <form className="mt-5 space-y-4" onSubmit={e => void submit(e)}>
        <label className="block space-y-1 text-sm font-medium">Nome completo<input className={field} required maxLength={150} value={name} onChange={e => setName(e.target.value)}/></label>
        {mode === 'create' && <><label className="block space-y-1 text-sm font-medium">E-mail<input type="email" className={field} required value={email} onChange={e => setEmail(e.target.value)} autoComplete="off"/></label>
          <label className="block space-y-1 text-sm font-medium">Senha inicial (mínimo 12 caracteres)<input className={field} type="password" minLength={12} maxLength={128} required autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)}/></label>
          <p className="text-xs text-slate-500">O Supabase poderá exigir confirmação por e-mail antes do primeiro acesso. Compartilhe a senha inicial por um canal seguro.</p></>}
        <div className="flex justify-end gap-2 pt-2"><button type="button" className={`${button} border border-slate-200`} onClick={close} disabled={busy}>Cancelar</button><button type="submit" disabled={busy} className={`${button} bg-blue-700 text-white hover:bg-blue-800`}>{busy ? 'Salvando...' : 'Salvar'}</button></div>
      </form>
    </div></div>}
  </div>
}
