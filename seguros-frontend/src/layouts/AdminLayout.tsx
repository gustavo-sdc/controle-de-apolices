import { useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  FolderOpen,
  Wallet,
  BarChart3,
  BriefcaseBusiness,
  ChevronRight,
  FileText,
  LogOut,
  Menu,
  ShieldCheck,
  Users,
  X,
  Building2,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const items = [
  { path: "/", name: "Visão geral", icon: BarChart3, exact: true },
  { path: "/clientes", name: "Clientes", icon: BriefcaseBusiness },
  { path: "/apolices", name: "Apólices", icon: FileText },
  { path: "/documentos", name: "Documentos", icon: FolderOpen },
  { path: "/financeiro", name: "Financeiro", icon: Wallet },
  {
    path: "/financeiro/apolices",
    name: "Financeiro das apólices",
    icon: Wallet,
  },
  {
    path: "/corretora/financeiro",
    name: "Financeiro da corretora",
    icon: Building2,
    manager: true,
  },
  { path: "/usuarios", name: "Usuários", icon: Users, manager: true },
];

export default function AdminLayout() {
  const { user, profile, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  const current =
    items.find((i) => i.path === location.pathname)?.name ?? "Gestão";
  const allowedItems = items.filter(
    (i) => !i.manager || profile?.role === "gestor",
  );
  async function logout() {
    setLogoutError("");
    try {
      await signOut();
      navigate("/login", { replace: true });
    } catch {
      setLogoutError("Não foi possível encerrar a sessão.");
    }
  }
  const sidebar = (
    <>
      <div className="flex h-[76px] items-center gap-3 border-b border-slate-200 px-6">
        <div className="flex size-10 items-center justify-center rounded-xl bg-blue-700 text-white">
          <ShieldCheck size={22} />
        </div>
        <div>
          <div className="text-[15px] font-bold tracking-tight text-slate-900">
            Gestão de Seguros
          </div>
          <div className="text-xs text-slate-500">Painel administrativo</div>
        </div>
        <button
          className="ml-auto rounded-lg p-1 text-slate-500 md:hidden"
          onClick={() => setOpen(false)}
          aria-label="Fechar menu"
        >
          <X size={20} />
        </button>
      </div>
      <div className="px-4 pt-7">
        <p className="mb-3 px-3 text-[11px] font-bold uppercase tracking-widest text-slate-400">
          Principal
        </p>
        <nav className="space-y-1" aria-label="Menu principal">
          {allowedItems.map(({ path, name, icon: Icon, exact }) => (
            <NavLink
              key={path}
              end={exact}
              to={path}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors ${isActive ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`
              }
            >
              <Icon size={19} strokeWidth={1.9} />
              {name}
            </NavLink>
          ))}
        </nav>
      </div>
      <div className="mt-auto border-t border-slate-200 p-4">
        <div className="mb-3 flex min-w-0 items-center gap-3 rounded-lg bg-slate-50 p-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">
            {(profile?.full_name || user?.email || "U").charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-800">
              {profile?.full_name || user?.email}
            </p>
            <p className="text-xs capitalize text-slate-500">{profile?.role}</p>
          </div>
        </div>
        <button
          onClick={() => void logout()}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
        >
          <LogOut size={18} /> Sair da conta
        </button>
        {logoutError && (
          <p role="alert" className="px-3 pt-2 text-xs text-red-700">
            {logoutError}
          </p>
        )}
      </div>
    </>
  );
  return (
    <div className="min-h-screen bg-[#f7f9fc] text-slate-900">
      {open && (
        <button
          aria-label="Fechar menu"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-slate-900/40 md:hidden"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[264px] flex-col border-r border-slate-200 bg-white transition-transform md:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        {sidebar}
      </aside>
      <div className="min-h-screen md:pl-[264px]">
        <header className="sticky top-0 z-20 flex h-[76px] items-center justify-between border-b border-slate-200 bg-white/95 px-5 backdrop-blur md:px-9">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setOpen(true)}
              aria-label="Abrir menu"
              className="rounded-lg p-2 hover:bg-slate-100 md:hidden"
            >
              <Menu size={22} />
            </button>
            <span className="text-sm text-slate-500">Painel</span>
            <ChevronRight size={15} className="text-slate-400" />
            <span className="text-sm font-semibold text-slate-800">
              {current}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden text-right sm:block">
              <div className="max-w-52 truncate text-sm font-semibold">
                {profile?.full_name || user?.email}
              </div>
              <div className="text-xs capitalize text-slate-500">
                {profile?.role}
              </div>
            </div>
            <span className="ml-2 flex size-9 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">
              {(profile?.full_name || user?.email || "U")
                .charAt(0)
                .toUpperCase()}
            </span>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1600px] p-5 md:p-9">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
