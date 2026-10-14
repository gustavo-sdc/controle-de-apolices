import { Construction } from 'lucide-react'
export default function ComingSoon({ title }: { title: string }) {
  return <div className="space-y-6"><div><p className="mb-2 text-xs font-bold uppercase tracking-widest text-blue-700">Gestão</p><h1 className="text-3xl font-bold tracking-tight">{title}</h1><p className="mt-2 text-sm text-slate-500">Módulo em preparação.</p></div><div className="rounded-xl border border-slate-200 bg-white p-10 text-center"><Construction className="mx-auto text-slate-400" size={32}/><h2 className="mt-4 text-lg font-semibold">{title} será a próxima etapa</h2><p className="mt-2 text-sm text-slate-500">A navegação já está preparada. Nenhum cadastro fictício foi criado.</p></div></div>
}
