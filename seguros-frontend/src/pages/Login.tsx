import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { ArrowRight, CheckCircle2, Eye, EyeOff, LoaderCircle, LockKeyhole, ShieldCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { branding } from '@/config/branding'
import BrandLockup from '@/components/brand/BrandLockup'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const benefits = [
  'Gestão centralizada de apólices',
  'Acompanhamento financeiro',
  'Organização de clientes e documentos',
]

export default function Login() {
  const navigate = useNavigate()
  const { user, profile, loading: checkingSession, refreshProfile } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setErrorMessage('')

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (error) throw error
      await refreshProfile()
      // A rota protegida permanece responsável por autorizar perfis ativos.
      navigate('/', { replace: true })
    } catch {
      setErrorMessage('Não foi possível entrar. Verifique suas credenciais e tente novamente.')
    } finally {
      setBusy(false)
    }
  }

  if (checkingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50" role="status">
        <LoaderCircle className="size-7 animate-spin text-blue-600" aria-hidden="true" />
        <span className="sr-only">Verificando sessão...</span>
      </div>
    )
  }

  if (user && profile?.is_active) return <Navigate to="/" replace />

  return (
    <main className="flex min-h-screen bg-white text-slate-900">
      <section className="relative hidden min-h-screen w-[48%] flex-col justify-between overflow-hidden border-r border-slate-200 bg-slate-50 p-12 lg:flex xl:p-16">
        <div aria-hidden="true" className="pointer-events-none absolute -right-40 -top-40 size-[500px] rounded-full border border-blue-100" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-20 size-[350px] rounded-full border border-blue-100" />
        <BrandLockup className="relative z-10" />
        <div className="relative z-10 max-w-lg">
          <span className="mb-8 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-4 py-2 text-xs font-semibold text-blue-700">
            <span className="size-2 rounded-full bg-blue-600" aria-hidden="true" />
            Gestão inteligente
          </span>
          <h1 className="text-4xl font-bold leading-tight tracking-tight xl:text-5xl">
            Sua operação de seguros,
            <span className="block text-blue-600">em um só lugar.</span>
          </h1>
          <p className="mt-6 max-w-md text-base leading-7 text-slate-500">
            Centralize clientes, apólices, documentos e informações financeiras em um ambiente organizado para o dia a dia.
          </p>
          <ul className="mt-12 space-y-5">
            {benefits.map((benefit) => (
              <li key={benefit} className="flex items-center gap-3 text-sm font-medium text-slate-700">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-50">
                  <CheckCircle2 className="size-4 text-blue-600" aria-hidden="true" />
                </span>
                {benefit}
              </li>
            ))}
          </ul>
        </div>
        <div className="relative z-10 flex items-center justify-between border-t border-slate-200 pt-6 text-xs text-slate-400">
          <span>{branding.name}</span><span>Ambiente corporativo</span>
        </div>
      </section>

      <section className="flex min-h-screen min-w-0 flex-1 flex-col bg-white">
        <div className="px-6 py-6 lg:hidden"><BrandLockup /></div>
        <div className="flex flex-1 items-center justify-center px-6 py-12 sm:px-10">
          <div className="w-full max-w-[400px]">
            <div className="mb-8 hidden size-12 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 lg:flex">
              <LockKeyhole className="size-5 text-slate-700" aria-hidden="true" />
            </div>
            <h2 className="text-3xl font-bold tracking-tight">Bem-vindo de volta</h2>
            <p className="mt-3 mb-9 text-sm leading-6 text-slate-500">
              Informe suas credenciais para acessar o painel de gestão.
            </p>
            <form className="space-y-5" onSubmit={(event) => void submit(event)}>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-semibold text-slate-700">E-mail corporativo</Label>
                <Input id="email" type="email" inputMode="email" autoComplete="email" placeholder="nome@empresa.com.br"
                  value={email} onChange={(event) => setEmail(event.target.value)} disabled={busy} required
                  className="h-12 rounded-lg border-slate-200 bg-white px-4 text-sm shadow-none focus-visible:ring-blue-500" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-semibold text-slate-700">Senha</Label>
                <div className="relative">
                  <Input id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password"
                    placeholder="Digite sua senha" value={password} onChange={(event) => setPassword(event.target.value)}
                    disabled={busy} required className="h-12 rounded-lg border-slate-200 bg-white px-4 pr-12 text-sm shadow-none focus-visible:ring-blue-500" />
                  <button type="button" disabled={busy} onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} aria-pressed={showPassword}
                    className="absolute inset-y-0 right-3 flex items-center justify-center rounded-md px-1 text-slate-400 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
                    {showPassword ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
                  </button>
                </div>
              </div>
              {errorMessage && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">{errorMessage}</div>}
              <Button type="submit" disabled={busy || !email.trim() || !password}
                className="h-12 w-full rounded-lg bg-blue-600 text-sm font-semibold text-white shadow-sm hover:bg-blue-700">
                {busy ? <><LoaderCircle className="mr-2 size-4 animate-spin" aria-hidden="true" />Autenticando...</> : <>Acessar sistema<ArrowRight className="ml-2 size-4" aria-hidden="true" /></>}
              </Button>
            </form>
            <div className="mt-10 border-t border-slate-100 pt-6 text-center">
              <span className="inline-flex items-center gap-2 text-xs text-slate-400">
                <ShieldCheck className="size-4" aria-hidden="true" />Acesso restrito a usuários autorizados
              </span>
            </div>
          </div>
        </div>
        <footer className="px-6 py-6 text-center text-xs text-slate-400">
          © {new Date().getFullYear()} {branding.name}.
        </footer>
      </section>
    </main>
  )
}
