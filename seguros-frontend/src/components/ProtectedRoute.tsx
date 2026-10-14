import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

export function ProtectedRoute() {
  const { user, profile, loading } = useAuth()
  if (loading) return <div className="min-h-screen grid place-items-center">Carregando...</div>
  if (!user) return <Navigate to="/login" replace />
  if (!profile?.is_active) return <Navigate to="/acesso-bloqueado" replace />
  return <Outlet />
}
