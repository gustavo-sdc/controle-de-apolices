import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import AdminLayout from '@/layouts/AdminLayout'
import Dashboard from '@/pages/Dashboard'
import Login from '@/pages/Login'
import Clients from '@/pages/Clients'
import Policies from '@/pages/Policies'
import Documents from '@/pages/Documents'
import Users from '@/pages/Users'
import Finance from '@/pages/Finance'
import Brokerage from '@/pages/Brokerage'
import PolicyFinancialIndex from '@/pages/PolicyFinancialIndex'
import PolicyFinancials from '@/pages/PolicyFinancials'

function Blocked() {
  const { user, profile, loading, signOut } = useAuth()
  if (loading) return <div className="grid min-h-screen place-items-center">Carregando...</div>
  if (!user) return <Navigate to="/login" replace />
  if (profile?.is_active) return <Navigate to="/" replace />
  return <main className="grid min-h-screen place-items-center bg-slate-50 p-5"><div className="w-full max-w-md space-y-4 rounded-xl border bg-white p-8"><h1 className="text-2xl font-bold">Acesso não autorizado</h1><p className="text-slate-600">Seu perfil não existe ou está desativado. Solicite acesso ao gestor.</p><button onClick={() => void signOut()} className="rounded-lg bg-blue-700 px-4 py-2 text-white">Sair</button></div></main>
}
function ManagersOnly() {
  const { profile } = useAuth()
  return profile?.role === 'gestor' ? <Users/> : <Navigate to="/" replace />
}
export default function App() {
  return <AuthProvider><BrowserRouter><Routes>
    <Route path="/login" element={<Login/>}/>
    <Route path="/acesso-bloqueado" element={<Blocked/>}/>
      <Route element={<ProtectedRoute/>}><Route element={<AdminLayout/>}>
        <Route index element={<Dashboard/>}/>
        <Route path="clientes" element={<Clients/>}/>
        <Route path="apolices" element={<Policies/>}/>
        <Route path="documentos" element={<Documents/>}/>
        <Route path="financeiro" element={<Finance/>}/>
        
        <Route path="corretora/financeiro" element={<Brokerage />}/>
        <Route path="apolices/:id/financeiro" element={<PolicyFinancials />}/>
        <Route path="financeiro/apolices" element={<PolicyFinancialIndex />}/>
        
        <Route path="usuarios" element={<ManagersOnly/>}/>
      </Route>
    </Route>
      <Route path="*" element={<Navigate to="/" replace/>}/>
    </Routes>
  </BrowserRouter>
  </AuthProvider>
}
