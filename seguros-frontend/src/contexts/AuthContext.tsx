import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

type Role = 'gestor' | 'editor'
type Profile = { id: string; full_name: string; role: Role; is_active: boolean }
type AuthState = { user: User | null; profile: Profile | null; loading: boolean; refreshProfile: () => Promise<void>; signOut: () => Promise<void> }
const AuthContext = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const loadProfile = useCallback(async (currentUser: User | null) => {
    setUser(currentUser)
    if (!currentUser) { setProfile(null); return }
    const { data, error } = await supabase.from('profiles')
      .select('id,full_name,role,is_active')
      .eq('id', currentUser.id).maybeSingle()
    if (error) { setProfile(null); throw error }
    setProfile(data as Profile | null)
  }, [])

  const refreshProfile = useCallback(async () => {
    const { data: { user: currentUser }, error } = await supabase.auth.getUser()
    if (error) throw error
    await loadProfile(currentUser)
  }, [loadProfile])

  useEffect(() => {
    let mounted = true
    async function start() {
      try {
        const { data: { user: currentUser } } = await supabase.auth.getUser()
        if (mounted) await loadProfile(currentUser)
      } catch (error) { console.error('Erro ao carregar sessão:', error) }
      finally { if (mounted) setLoading(false) }
    }
    void start()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      // Agenda a consulta ao banco fora do callback de auth para evitar deadlocks.
      setTimeout(() => { if (mounted) void loadProfile(session?.user ?? null).catch(console.error) }, 0)
    })
    return () => { mounted = false; subscription.unsubscribe() }
  }, [loadProfile])

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    setUser(null); setProfile(null)
  }
  return <AuthContext.Provider value={{ user, profile, loading, refreshProfile, signOut }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth precisa estar dentro de AuthProvider')
  return value
}
