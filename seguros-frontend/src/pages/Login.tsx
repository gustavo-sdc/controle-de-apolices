import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function Login() {
  const navigate = useNavigate()
  const { user, profile, loading: checkingSession, refreshProfile } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  if (!checkingSession && user && profile?.is_active) return <Navigate to="/" replace />

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setErrorMessage(''); setBusy(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      await refreshProfile()
      navigate('/', { replace: true })
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível entrar.')
    } finally { setBusy(false) }
  }

  return <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
    <Card className="w-full max-w-md shadow-lg">
      <CardHeader><CardTitle className="text-2xl">Gestão de seguros</CardTitle><CardDescription>Entre com seu usuário do sistema.</CardDescription></CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-2"><Label htmlFor="email">E-mail</Label><Input id="email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required /></div>
          <div className="space-y-2"><Label htmlFor="password">Senha</Label><Input id="password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /></div>
          {errorMessage && <p role="alert" className="text-sm text-red-600">{errorMessage}</p>}
          <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Entrando...' : 'Entrar'}</Button>
        </form>
      </CardContent>
    </Card>
  </main>
}
