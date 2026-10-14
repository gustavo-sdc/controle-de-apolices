import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, ArrowUpRight, BriefcaseBusiness, CircleCheck, Clock3, FileText, RefreshCcw, Wallet } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { fetchDashboard, type DashboardSummary } from '@/services/dashboard'

const integer = new Intl.NumberFormat('pt-BR')
const money = new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' })

export default function Dashboard() {
  const { profile } = useAuth()
  const [stats, setStats] = useState<DashboardSummary | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setStats(await fetchDashboard()) }
    catch (e) { setStats(null); setError(e instanceof Error ? e.message : 'Não foi possível carregar o dashboard.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])
  const cards = stats ? [
    { label:'Clientes ativos', value: integer.format(stats.active_clients), icon:BriefcaseBusiness, color:'text-blue-700', bg:'bg-blue-50' },
    { label:'Apólices cadastradas', value:integer.format(stats.active_policy_records), icon:FileText, color:'text-indigo-700', bg:'bg-indigo-50' },
    { label:'Apólices vigentes', value:integer.format(stats.current_policies), icon:CircleCheck, color:'text-emerald-700', bg:'bg-emerald-50' },
    { label:'Apólices vencidas', value:integer.format(stats.expired_policies), icon:Clock3, color:'text-amber-700', bg:'bg-amber-50' },
    { label:'Parcelas em atraso', value:integer.format(stats.overdue_installments), icon:AlertCircle, color:'text-rose-700', bg:'bg-rose-50' },
    { label:'Valor em atraso', value:money.format(stats.overdue_amount), icon:Wallet, color:'text-slate-700', bg:'bg-slate-100' },
  ] : []
  return <div className="space-y-8">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="mb-2 text-xs font-bold uppercase tracking-widest text-blue-700">Visão geral</p><h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">Dashboard</h1><p className="mt-2 text-sm text-slate-500">Bem-vindo, {profile?.full_name || 'usuário'}. Acompanhe os indicadores da operação.</p></div>
      <button onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"><RefreshCcw size={16} className={loading ? 'animate-spin' : ''}/> Atualizar</button>
    </div>
    {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><span className="flex items-center gap-2"><AlertCircle size={18}/>{error}</span><button onClick={() => void load()} className="font-semibold underline">Tentar novamente</button></div>}
    <section aria-label="Indicadores" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {loading ? Array.from({ length:6 }, (_,i) => <div key={i} className="h-40 animate-pulse rounded-xl border border-slate-200 bg-white p-6"><div className="h-4 w-1/2 rounded bg-slate-100"/><div className="mt-9 h-8 w-1/3 rounded bg-slate-100"/></div>) : cards.map(({label,value,icon:Icon,color,bg}) =>
        <article key={label} className="rounded-xl border border-slate-200 bg-white p-6 shadow-[0_2px_12px_rgba(15,23,42,0.03)]"><div className="flex items-start justify-between gap-3"><p className="text-sm font-medium text-slate-500">{label}</p><div className={`rounded-lg p-2.5 ${bg} ${color}`}><Icon size={21}/></div></div><p className="mt-5 break-words text-3xl font-bold tracking-tight text-slate-900">{value}</p><p className="mt-3 flex items-center gap-1 text-xs text-slate-400"><ArrowUpRight size={14}/> Dados atuais do sistema</p></article>
      )}
    </section>
    {!loading && !error && stats && <section className="rounded-xl border border-slate-200 bg-white p-6"><h2 className="text-base font-bold text-slate-900">Resumo operacional</h2><p className="mt-2 text-sm leading-7 text-slate-600">Os números apresentados são calculados diretamente no banco de dados e retornados pela Edge Function. As próximas etapas incluirão listagens detalhadas, filtros, gráficos históricos e alertas de renovação.</p></section>}
    <p className="text-xs text-slate-400">Indicadores atualizados ao abrir a página ou clicar em “Atualizar”.</p>
  </div>
}
