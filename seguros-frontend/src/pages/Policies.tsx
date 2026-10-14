import { Link, useNavigate } from 'react-router-dom'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { ChevronLeft, ChevronRight, FileText, Pencil, Plus, RefreshCw, Search, Users, X } from 'lucide-react'
import type { Client, Person } from '@/services/clients'
import {
  blankPolicy, attachMember, createPerson, deactivateMember, ensurePrincipal, getClientMap,
  getPeopleMap, listAll, listMembers, listPolicies, patchPolicy,
  savePolicy, type Insured, type Policy, type PolicyForm, type PolicyMember, type PolicyStatus,
} from '@/services/policies'

const date = (value: string | null) => value ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR') : '—'
const currency = (value: number | null) => value === null ? '—' : Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const statusNames: Record<PolicyStatus, string> = { rascunho: 'Rascunho', ativa: 'Ativa', suspensa: 'Suspensa', cancelada: 'Cancelada', encerrada: 'Encerrada' }
const statusColors: Record<PolicyStatus, string> = { rascunho: 'bg-slate-100 text-slate-700', ativa: 'bg-emerald-50 text-emerald-700', suspensa: 'bg-amber-50 text-amber-700', cancelada: 'bg-red-50 text-red-700', encerrada: 'bg-slate-100 text-slate-500' }
const inputClass = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100'
const labelClass = 'block space-y-1 text-sm font-medium text-slate-700'
const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50'

function clientName(client?: Client, people?: Record<string, Person>) {
  if (!client) return 'Cliente não encontrado'
  return client.kind === 'pj' ? client.trade_name || client.company_name || 'Empresa' : (client.person_id && people?.[client.person_id]?.full_name) || 'Pessoa física'
}

export default function Policies() {
  const navigate = useNavigate()
  const [policies, setPolicies] = useState<Policy[]>([])
  const [clients, setClients] = useState<Record<string, Client>>({})
  const [people, setPeople] = useState<Record<string, Person>>({})
  const [offset, setOffset] = useState(0)
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('todos')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Policy | null>(null)
  const [form, setForm] = useState<PolicyForm>(blankPolicy)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [selected, setSelected] = useState<Policy | null>(null)
  const [members, setMembers] = useState<PolicyMember[]>([])
  const [insured, setInsured] = useState<Record<string, Insured>>({})
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')
  const [busy, setBusy] = useState(false)
  const [memberPerson, setMemberPerson] = useState('')
  const [relation, setRelation] = useState<'segurado' | 'dependente'>('segurado')
  const [responsible, setResponsible] = useState('')
  const [newPersonName, setNewPersonName] = useState('')
  const [newPersonCpf, setNewPersonCpf] = useState('')
  const [addingPerson, setAddingPerson] = useState(false)
  const limit = 20

  const reload = useCallback(async () => {
    const [page, clientMap, peopleMap] = await Promise.all([listPolicies(offset, limit), getClientMap(), getPeopleMap()])
    setPolicies(page.data)
    setTotal(page.pagination.total)
    setClients(clientMap)
    setPeople(peopleMap)
  }, [offset])

  useEffect(() => {
    let ignore = false
    async function fetchData() {
      try {
        const [page, clientMap, peopleMap] = await Promise.all([listPolicies(offset, limit), getClientMap(), getPeopleMap()])
        if (ignore) return
        setPolicies(page.data); setTotal(page.pagination.total); setClients(clientMap); setPeople(peopleMap); setError('')
      } catch (e) { if (!ignore) setError(e instanceof Error ? e.message : 'Falha ao carregar apólices') }
      finally { if (!ignore) setLoading(false) }
    }
    void fetchData()
    return () => { ignore = true }
  }, [offset])

  const shown = useMemo(() => policies.filter(p => {
    const matching = [p.policy_number, p.insurer_name, p.insurance_type, clientName(clients[p.client_id], people)]
      .join(' ').toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'))
    return matching && (statusFilter === 'todos' || p.status === statusFilter)
  }), [policies, search, statusFilter, clients, people])

  function openNew() { setForm(blankPolicy); setEditing(null); setFormError(''); setModalOpen(true) }
  function openEdit(policy: Policy) {
    setEditing(policy); setFormError('')
    setForm({
      client_id: policy.client_id, policy_number: policy.policy_number, proposal_number: policy.proposal_number || '',
      insurer_name: policy.insurer_name, broker_name: policy.broker_name || '', product_name: policy.product_name || '',
      insurance_type: policy.insurance_type, description: policy.description || '', effective_from: policy.effective_from,
      effective_until: policy.effective_until, issue_date: policy.issue_date || '',
      coverage_amount: policy.coverage_amount?.toString() || '', premium_amount: policy.premium_amount?.toString() || '',
      deductible_amount: policy.deductible_amount?.toString() || '', notes: policy.notes || '',
    }); setModalOpen(true)
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setFormError('')
    try {
      const saved = await savePolicy(form, editing || undefined)
      if (!editing && clients[saved.client_id]?.kind === 'pf') {
        try { await ensurePrincipal(saved, clients[saved.client_id]) }
        catch (e) {
          setFormError(`Apólice ${saved.policy_number} criada como rascunho, mas o vínculo do titular falhou: ${e instanceof Error ? e.message : String(e)}. Feche e abra a apólice para corrigir.`)
          await reload(); return
        }
      }
      setModalOpen(false); await reload()
      if (!editing) navigate(`/apolices/${saved.id}/financeiro`)
    } catch (e) { setFormError(e instanceof Error ? e.message : 'Não foi possível salvar a apólice') }
    finally { setSaving(false) }
  }
  async function fetchDetail(policy: Policy) {
    setDetailLoading(true); setDetailError('')
    try {
      const [links, allInsured, peopleMap] = await Promise.all([
        listMembers(policy.id), listAll<Insured>('insured_persons'), getPeopleMap(),
      ])
      setMembers(links); setInsured(Object.fromEntries(allInsured.map(i => [i.id, i]))); setPeople(peopleMap)
    } catch (e) { setDetailError(e instanceof Error ? e.message : 'Falha ao carregar segurados') }
    finally { setDetailLoading(false) }
  }
  async function openDetail(policy: Policy) {
    setSelected(policy); setMemberPerson(''); setResponsible(''); setRelation('segurado')
    await fetchDetail(policy)
  }
  async function changeStatus(status: PolicyStatus) {
    if (!selected) return
    if (status === 'cancelada' && !window.confirm('Confirma o cancelamento desta apólice?')) return
    setBusy(true); setDetailError('')
    try {
      const updated = await patchPolicy(selected.id, { status })
      setSelected(updated); await reload()
    } catch (e) { setDetailError(e instanceof Error ? e.message : 'Falha ao alterar o status') }
    finally { setBusy(false) }
  }
  async function togglePolicy() {
    if (!selected || !window.confirm(`Deseja ${selected.is_active ? 'desativar' : 'reativar'} esta apólice?`)) return
    setBusy(true); setDetailError('')
    try { const updated = await patchPolicy(selected.id, { is_active: !selected.is_active }); setSelected(updated); await reload() }
    catch (e) { setDetailError(e instanceof Error ? e.message : 'Falha ao atualizar') }
    finally { setBusy(false) }
  }
  async function addMember() {
    if (!selected || !memberPerson) return
    if (relation === 'dependente' && !responsible) { setDetailError('Selecione o responsável pelo dependente.'); return }
    setBusy(true); setDetailError('')
    try {
      await attachMember(selected.id, memberPerson, relation, responsible || null, members)
      setMemberPerson(''); setResponsible(''); await fetchDetail(selected)
    } catch (e) { setDetailError(e instanceof Error ? e.message : 'Falha ao vincular pessoa') }
    finally { setBusy(false) }
  }
  async function addPerson() {
    setBusy(true); setDetailError('')
    try {
      const person = await createPerson(newPersonName, newPersonCpf)
      setPeople(old => ({ ...old, [person.id]: person }))
      setMemberPerson(person.id); setNewPersonName(''); setNewPersonCpf(''); setAddingPerson(false)
    } catch (e) { setDetailError(e instanceof Error ? e.message : 'Falha ao cadastrar pessoa') }
    finally { setBusy(false) }
  }
  async function removeMember(member: PolicyMember) {
    if (!selected || !window.confirm('Desativar o vínculo desta pessoa com a apólice?')) return
    setBusy(true); setDetailError('')
    try { await deactivateMember(member.id); await fetchDetail(selected) }
    catch (e) { setDetailError(e instanceof Error ? e.message : 'Falha ao desativar vínculo') }
    finally { setBusy(false) }
  }
  const activeMembers = members.filter(m => m.is_active)
  const availablePeople = Object.values(people).filter(p => p.is_active)
    .sort((a, b) => a.full_name.localeCompare(b.full_name, 'pt-BR'))
  const eligibleResponsible = activeMembers.filter(m => m.relation !== 'dependente')
  const client = selected ? clients[selected.client_id] : undefined
  const field = (key: keyof PolicyForm, title: string, attrs: { required?: boolean; type?: string; placeholder?: string } = {}) =>
    <label className={labelClass} key={key}><span>{title}</span><input className={inputClass} value={form[key]} onChange={e => setForm(old => ({ ...old, [key]: e.target.value }))} {...attrs}/></label>

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-medium text-blue-700">Operações</p><h1 className="mt-1 text-2xl font-bold text-slate-900">Apólices</h1><p className="text-sm text-slate-500">Contratos, vigência e pessoas seguradas.</p></div><button className={buttonClass} onClick={openNew}><Plus size={17}/> Nova apólice</button></div>
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-4"><div className="relative min-w-48 flex-1"><Search size={17} className="absolute left-3 top-3 text-slate-400"/><input aria-label="Pesquisar apólices nesta página" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar número, seguradora ou cliente..." className={`${inputClass} pl-10`}/></div><select aria-label="Filtrar status" className={`${inputClass} w-auto`} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="todos">Todos os status</option>{Object.entries(statusNames).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select><button aria-label="Atualizar apólices" onClick={() => { setLoading(true); void reload().catch(e => setError(String(e))).finally(() => setLoading(false)) }} className="rounded-lg border border-slate-200 p-2.5"><RefreshCw size={17}/></button></div>
      {error && <p role="alert" className="m-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-4">Apólice</th><th className="px-5 py-4">Cliente</th><th className="px-5 py-4">Seguradora</th><th className="px-5 py-4">Vigência</th><th className="px-5 py-4">Status</th><th className="px-5 py-4 text-right">Ações</th></tr></thead><tbody className="divide-y divide-slate-100">{shown.map(p => <tr key={p.id} className="hover:bg-slate-50"><td className="px-5 py-4"><div className="flex items-center gap-2 font-semibold text-slate-900"><FileText size={17} className="text-blue-700"/>{p.policy_number}</div><span className="text-xs text-slate-500">{p.insurance_type}</span></td><td className="px-5 py-4 text-slate-700">{clientName(clients[p.client_id], people)}</td><td className="px-5 py-4 text-slate-600">{p.insurer_name}</td><td className="px-5 py-4 text-slate-600">{date(p.effective_from)} — {date(p.effective_until)}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusColors[p.status]}`}>{statusNames[p.status]}</span>{!p.is_active && <span className="ml-1 text-xs text-red-700">Inativa</span>}</td><td className="px-5 py-4"><div className="flex justify-end gap-2"><Link to={`/apolices/${p.id}/financeiro`} className="rounded-lg border border-blue-200 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50">Financeiro</Link><button onClick={() => openEdit(p)} title="Editar apólice" className="rounded-lg border p-2"><Pencil size={16}/></button><button onClick={() => void openDetail(p)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold hover:bg-slate-100">Detalhes</button></div></td></tr>)}</tbody></table>{!loading && shown.length === 0 && <p className="p-10 text-center text-sm text-slate-500">Nenhuma apólice encontrada.</p>}{loading && <p className="p-8 text-center text-sm text-slate-500">Carregando apólices...</p>}</div>
      <div className="flex items-center justify-between border-t px-5 py-4 text-sm text-slate-500"><span>{total} apólices · {shown.length} nesta página</span><div className="flex gap-2"><button aria-label="Página anterior" className="rounded-lg border p-2 disabled:opacity-40" disabled={offset === 0 || loading} onClick={() => { setLoading(true); setOffset(Math.max(0, offset-limit)) }}><ChevronLeft size={18}/></button><button aria-label="Próxima página" className="rounded-lg border p-2 disabled:opacity-40" disabled={offset+limit >= total || loading} onClick={() => { setLoading(true); setOffset(offset+limit) }}><ChevronRight size={18}/></button></div></div>
    </section>
    <p className="text-xs text-slate-500">A pesquisa e o filtro abrangem somente a página atual. A consulta global será adicionada ao backend.</p>

    {modalOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4"><section role="dialog" aria-modal="true" aria-label={editing ? 'Editar apólice' : 'Nova apólice'} className="flex max-h-[93vh] w-full max-w-3xl flex-col rounded-xl bg-white shadow-xl"><div className="flex items-center justify-between border-b p-5"><h2 className="text-xl font-bold">{editing ? 'Editar apólice' : 'Nova apólice'}</h2><button aria-label="Fechar" disabled={saving} onClick={() => setModalOpen(false)}><X/></button></div><form onSubmit={e => void submit(e)} className="overflow-y-auto"><div className="grid gap-4 p-5 sm:grid-cols-2"><label className={`${labelClass} sm:col-span-2`}><span>Cliente *</span><select className={inputClass} required disabled={!!editing} value={form.client_id} onChange={e => setForm(f => ({...f,client_id:e.target.value}))}><option value="">Selecione um cliente</option>{Object.values(clients).filter(c => c.is_active || c.id === editing?.client_id).sort((a,b) => clientName(a,people).localeCompare(clientName(b,people))).map(c => <option key={c.id} value={c.id}>{clientName(c,people)} ({c.kind.toUpperCase()})</option>)}</select></label>{field('policy_number','Número da apólice *',{required:true})}{field('proposal_number','Número da proposta')}{field('insurer_name','Seguradora *',{required:true})}{field('broker_name','Corretor(a)')}{field('insurance_type','Ramo do seguro *',{required:true,placeholder:'Vida, saúde, automóvel...'})}{field('product_name','Produto')}{field('effective_from','Início de vigência *',{required:true,type:'date'})}{field('effective_until','Fim de vigência *',{required:true,type:'date'})}{field('issue_date','Data de emissão',{type:'date'})}{field('coverage_amount','Capital segurado (R$)',{placeholder:'Ex.: 100000.00'})}{field('premium_amount','Prêmio total (R$)',{placeholder:'Ex.: 1500.00'})}{field('deductible_amount','Franquia (R$)',{placeholder:'Ex.: 500.00'})}{field('description','Descrição')}{field('notes','Observações')}</div>{formError && <p role="alert" className="mx-5 mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{formError}</p>}<div className="flex items-center justify-between gap-3 border-t p-5"><span className="text-xs text-slate-500">Após criar a apólice, configure prêmio líquido, juros e agenciamento.</span><div className="flex gap-2"><button type="button" disabled={saving} className="rounded-lg border px-4 py-2 text-sm" onClick={() => setModalOpen(false)}>Cancelar</button><button type="submit" disabled={saving} className={buttonClass}>{saving ? 'Salvando...' : 'Salvar apólice'}</button></div></div></form></section></div>}

    {selected && <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/50"><section role="dialog" aria-modal="true" aria-label="Detalhes da apólice" className="flex h-full w-full max-w-3xl flex-col bg-white shadow-2xl"><div className="flex items-center justify-between border-b p-5"><div><p className="text-xs font-semibold text-blue-700">Apólice {selected.policy_number}</p><h2 className="text-xl font-bold">{clientName(client, people)}</h2></div><button aria-label="Fechar detalhes" onClick={() => setSelected(null)}><X size={22}/></button></div><div className="flex-1 space-y-6 overflow-y-auto p-5"><div className="grid gap-3 rounded-xl border bg-slate-50 p-4 text-sm sm:grid-cols-3"><div><p className="text-slate-500">Status</p><strong>{statusNames[selected.status]}</strong></div><div><p className="text-slate-500">Vigência</p><strong>{date(selected.effective_from)} a {date(selected.effective_until)}</strong></div><div><p className="text-slate-500">Prêmio</p><strong>{currency(selected.premium_amount)}</strong></div></div><div className="flex flex-wrap items-center gap-2"><Link to={`/apolices/${selected.id}/financeiro`} className="rounded-lg border border-blue-200 px-3 py-2 text-sm font-semibold text-blue-700">Abrir financeiro da apólice</Link><label className="text-sm font-medium">Alterar status:</label><select aria-label="Alterar status" className={`${inputClass} w-auto`} disabled={busy || !selected.is_active} value={selected.status} onChange={e => void changeStatus(e.target.value as PolicyStatus)}>{Object.entries(statusNames).map(([id,name]) => <option key={id} value={id}>{name}</option>)}</select><button disabled={busy} onClick={() => void togglePolicy()} className="rounded-lg border px-3 py-2 text-sm">{selected.is_active ? 'Desativar apólice' : 'Reativar apólice'}</button></div>{detailError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{detailError}</p>}
      <div className="space-y-4"><div className="flex items-center gap-2"><Users className="text-blue-700" size={19}/><h3 className="font-bold">Segurados e dependentes</h3><span className="text-xs text-slate-500">({activeMembers.length})</span></div>{detailLoading && <p className="text-sm text-slate-500">Carregando vínculos...</p>}{!detailLoading && activeMembers.length === 0 && <p className="rounded-lg border border-dashed p-4 text-sm text-slate-500">Nenhuma pessoa vinculada.</p>}{activeMembers.map(m => <div key={m.id} className="flex items-center justify-between gap-3 rounded-lg border p-3"><div><p className="font-semibold">{people[insured[m.insured_person_id]?.person_id]?.full_name || 'Pessoa não encontrada'}</p><p className="text-xs capitalize text-slate-500">{m.relation}{m.responsible_insured_id ? ` · Responsável: ${people[insured[members.find(x => x.id === m.responsible_insured_id)?.insured_person_id || '']?.person_id]?.full_name || 'Não encontrado'}` : ''}</p></div>{m.relation !== 'titular' && <button disabled={busy} onClick={() => void removeMember(m)} className="rounded-lg border px-3 py-2 text-xs hover:bg-slate-50">Desativar</button>}</div>)}
      <div className="space-y-3 rounded-xl border bg-slate-50 p-4"><h4 className="font-semibold">Adicionar pessoa à apólice</h4><div className="grid gap-3 sm:grid-cols-2"><label className={labelClass}><span>Pessoa cadastrada</span><select className={inputClass} value={memberPerson} onChange={e => setMemberPerson(e.target.value)}><option value="">Selecione uma pessoa</option>{availablePeople.map(p => <option key={p.id} value={p.id}>{p.full_name}{p.cpf ? ` · ${p.cpf}` : ''}</option>)}</select></label><label className={labelClass}><span>Vínculo</span><select className={inputClass} value={relation} onChange={e => { setRelation(e.target.value as 'segurado'|'dependente'); setResponsible('') }}><option value="segurado">Segurado</option><option value="dependente">Dependente</option></select></label>{relation === 'dependente' && <label className={`${labelClass} sm:col-span-2`}><span>Responsável *</span><select className={inputClass} value={responsible} onChange={e => setResponsible(e.target.value)}><option value="">Selecione</option>{eligibleResponsible.map(m => <option key={m.id} value={m.id}>{people[insured[m.insured_person_id]?.person_id]?.full_name || m.id}</option>)}</select></label>}</div><div className="flex flex-wrap justify-between gap-3"><button type="button" className="text-sm font-semibold text-blue-700 underline" onClick={() => setAddingPerson(!addingPerson)}>{addingPerson ? 'Fechar cadastro rápido' : '+ Cadastrar nova pessoa'}</button><button className={buttonClass} disabled={busy || !memberPerson || (relation === 'dependente' && !responsible)} onClick={() => void addMember()}>Vincular pessoa</button></div>{addingPerson && <div className="grid gap-3 border-t pt-3 sm:grid-cols-2"><label className={labelClass}>Nome completo<input className={inputClass} value={newPersonName} onChange={e => setNewPersonName(e.target.value)}/></label><label className={labelClass}>CPF (opcional)<input className={inputClass} value={newPersonCpf} onChange={e => setNewPersonCpf(e.target.value)}/></label><button disabled={busy || !newPersonName.trim()} onClick={() => void addPerson()} className={`${buttonClass} sm:col-span-2`}>Cadastrar pessoa e selecionar</button></div>}</div>
      {client?.kind === 'pf' && !activeMembers.some(m => m.relation === 'titular') && <button className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900" disabled={busy} onClick={() => { if (!client) return; setBusy(true); void ensurePrincipal(selected,client).then(() => fetchDetail(selected)).catch(e => setDetailError(String(e))).finally(() => setBusy(false)) }}>Restaurar vínculo do titular PF</button>}
      </div></div></section></div>}
  </div>
}
