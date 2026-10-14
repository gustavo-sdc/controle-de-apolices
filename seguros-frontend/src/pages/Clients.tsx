import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  UserRound,
  X,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  type Client,
  type ClientFormValues,
  type Person,
  getPerson,
  listClients,
  saveClient,
  setClientActive,
} from "@/services/clients";

const INITIAL: ClientFormValues = {
  kind: "pf",
  full_name: "",
  cpf: "",
  company_name: "",
  trade_name: "",
  cnpj: "",
  contact_name: "",
  email: "",
  phone: "",
  city: "",
  state_code: "",
  notes: "",
};
const fmt = (v: string | null | undefined) => v || "—";
const digits = (v: string) => v.replace(/\D/g, "");
const cpfFormat = (v: string | null) =>
  v && v.length === 11
    ? `${v.slice(0, 3)}.${v.slice(3, 6)}.${v.slice(6, 9)}-${v.slice(9)}`
    : fmt(v);
const cnpjFormat = (v: string | null) =>
  v && v.length === 14
    ? `${v.slice(0, 2)}.${v.slice(2, 5)}.${v.slice(5, 8)}/${v.slice(8, 12)}-${v.slice(12)}`
    : fmt(v);
const labelFor = (c: Client, persons: Record<string, Person>) =>
  c.kind === "pf"
    ? (c.person_id && persons[c.person_id]?.full_name) ||
      "Pessoa não encontrada"
    : c.trade_name || c.company_name || "Empresa sem nome";

export default function Clients() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<Client[]>([]);
  const [people, setPeople] = useState<Record<string, Person>>({});
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | "pf" | "pj">("all");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "inactive"
  >("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Client | null>(null);
  const [form, setForm] = useState<ClientFormValues>(INITIAL);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const limit = 20;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const page = await listClients(offset, limit);
      setRows(page.data);
      setTotal(page.pagination.total);

      const ids = [
        ...new Set(
          page.data
            .filter((x) => x.kind === "pf" && x.person_id)
            .map((x) => x.person_id!),
        ),
      ];

      const fetched = await Promise.all(
        ids.map((id) => getPerson(id).catch(() => null)),
      );

      setPeople((old) => {
        const next = { ...old };

        fetched.forEach((p, i) => {
          if (p) next[ids[i]] = p;
        });
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar clientes");
    } finally {
      setLoading(false);
    }
  }, [offset]);

  useEffect(() => {
    let cancelled = false;

    async function fetchClients() {
      try {
        const page = await listClients(offset, limit);

        const ids = [
          ...new Set(
            page.data
              .filter((c) => c.kind === "pf" && c.person_id)
              .map((c) => c.person_id!),
          ),
        ];

        const fetched = await Promise.all(
          ids.map((id) => getPerson(id).catch(() => null)),
        );

        if (cancelled) return;

        setRows(page.data);
        setTotal(page.pagination.total);

        setPeople((old) => {
          const next = { ...old };

          fetched.forEach((person, index) => {
            if (person) {
              next[ids[index]] = person;
            }
          });

          return next;
        });

        setError("");
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Falha ao carregar clientes",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void fetchClients();

    return () => {
      cancelled = true;
    };
  }, [offset]);

  async function openEdit(c: Client) {
    setFormError("");
    setEditing(c);
    setForm({
      ...INITIAL,
      kind: c.kind,
      company_name: c.company_name || "",
      trade_name: c.trade_name || "",
      cnpj: c.cnpj || "",
      contact_name: c.contact_name || "",
      email: c.email || "",
      phone: c.phone || "",
      city: c.city || "",
      state_code: c.state_code || "",
      notes: c.notes || "",
      full_name: c.person_id ? people[c.person_id]?.full_name || "" : "",
      cpf: c.person_id ? people[c.person_id]?.cpf || "" : "",
    });
    setModalOpen(true);
    if (c.kind === "pf" && c.person_id) {
      try {
        const p = await getPerson(c.person_id);
        setForm((f) => ({ ...f, full_name: p.full_name, cpf: p.cpf || "" }));
      } catch {
        setFormError(
          "Não foi possível carregar os dados pessoais. Feche e tente novamente.",
        );
      }
    }
  }
  function openNew() {
    setEditing(null);
    setForm(INITIAL);
    setFormError("");
    setModalOpen(true);
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      await saveClient(form, editing || undefined);
      setModalOpen(false);
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Não foi possível salvar");
    } finally {
      setSaving(false);
    }
  }
  async function toggle(c: Client) {
    const action = c.is_active ? "desativar" : "reativar";
    if (!window.confirm(`Deseja ${action} este cliente?`)) return;
    setBusyId(c.id);
    setError("");
    try {
      await setClientActive(c.id, !c.is_active);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao atualizar cliente");
    } finally {
      setBusyId(null);
    }
  }
  const displayed = rows.filter((c) => {
    const needle = query.trim().toLocaleLowerCase("pt-BR");
    const searchable = [
      labelFor(c, people),
      c.company_name,
      c.cnpj,
      c.person_id ? people[c.person_id]?.cpf : "",
      c.email,
    ]
      .join(" ")
      .toLocaleLowerCase("pt-BR");
    return (
      (!needle ||
        searchable.includes(needle) ||
        digits(searchable).includes(digits(needle) || "~~~")) &&
      (kindFilter === "all" || c.kind === kindFilter) &&
      (statusFilter === "all" || c.is_active === (statusFilter === "active"))
    );
  });
  const field = (
    key: keyof ClientFormValues,
    label: string,
    attrs: {
      required?: boolean;
      maxLength?: number;
      placeholder?: string;
      type?: string;
    } = {},
  ) => (
    <label
      className="block space-y-1.5 text-sm font-medium text-slate-700"
      key={key}
    >
      <span>{label}</span>
      <input
        value={form[key]}
        onChange={(e) => setForm((old) => ({ ...old, [key]: e.target.value }))}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
        {...attrs}
      />
    </label>
  );
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-blue-700">Cadastros</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            Clientes
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Pessoas físicas e jurídicas vinculadas às apólices.
          </p>
        </div>

        <button
          onClick={openNew}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"
        >
          <Plus size={17} /> Novo cliente
        </button>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-4">
          <label className="relative min-w-48 flex-1">
            <Search
              size={17}
              className="absolute left-3 top-3 text-slate-400"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Pesquisar nesta página..."
              aria-label="Pesquisar nesta página"
              className="w-full rounded-lg border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-500"
            />
          </label>

          <select
            aria-label="Tipo"
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value as typeof kindFilter)}
            className="rounded-lg border border-slate-200 bg-white p-2.5 text-sm"
          >
            <option value="all">Todos os tipos</option>
            <option value="pf">Pessoa física</option>
            <option value="pj">Pessoa jurídica</option>
          </select>
          <select
            aria-label="Situação"
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as typeof statusFilter)
            }
            className="rounded-lg border border-slate-200 bg-white p-2.5 text-sm"
          >
            <option value="all">Todas as situações</option>
            <option value="active">Ativos</option>
            <option value="inactive">Inativos</option>
          </select>
          <button
            title="Atualizar"
            onClick={() => void load()}
            className="rounded-lg border border-slate-200 p-2.5 hover:bg-slate-50"
          >
            <RefreshCw size={18} />
          </button>
        </div>
        {error && (
          <div
            role="alert"
            className="m-4 flex gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700"
          >
            <CircleAlert size={18} />
            {error}
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-4">Cliente</th>
                <th className="px-5 py-4">Documento</th>
                <th className="px-5 py-4">Contato</th>
                <th className="px-5 py-4">Status</th>
                <th className="px-5 py-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayed.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50/70">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <span className="rounded-lg bg-blue-50 p-2 text-blue-700">
                        {c.kind === "pf" ? (
                          <UserRound size={18} />
                        ) : (
                          <Building2 size={18} />
                        )}
                      </span>
                      <div>
                        <p className="font-semibold text-slate-900">
                          {labelFor(c, people)}
                        </p>
                        <p className="text-xs text-slate-500">
                          {c.kind === "pf"
                            ? "Pessoa física"
                            : "Pessoa jurídica"}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-slate-600">
                    {c.kind === "pf"
                      ? cpfFormat(
                          c.person_id ? people[c.person_id]?.cpf || null : null,
                        )
                      : cnpjFormat(c.cnpj)}
                  </td>
                  <td className="px-5 py-4 text-slate-600">
                    {fmt(c.email)}
                    <p className="text-xs">{fmt(c.phone)}</p>
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${c.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}
                    >
                      {c.is_active ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex justify-end gap-2">
                      <button
                        title="Editar"
                        onClick={() => void openEdit(c)}
                        className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-100"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        disabled={busyId === c.id}
                        onClick={() => void toggle(c)}
                        className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                      >
                        {c.is_active ? "Desativar" : "Reativar"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && displayed.length === 0 && (
            <div className="p-12 text-center text-sm text-slate-500">
              Nenhum cliente encontrado.
            </div>
          )}
          {loading && (
            <div className="p-8 text-center text-sm text-slate-500">
              Carregando clientes...
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-slate-200 px-5 py-4 text-sm text-slate-500">
          <span>
            {total} clientes no total · exibindo {displayed.length} nesta página
          </span>
          <div className="flex gap-2">
            <button
              disabled={offset === 0 || loading}
              onClick={() => setOffset(Math.max(0, offset - limit))}
              className="rounded-lg border border-slate-200 p-2 disabled:opacity-40"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              disabled={offset + limit >= total || loading}
              onClick={() => setOffset(offset + limit)}
              className="rounded-lg border border-slate-200 p-2 disabled:opacity-40"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </section>
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !saving) setModalOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label={editing ? "Editar cliente" : "Novo cliente"}
            className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-200 p-5">
              <div>
                <h2 className="text-xl font-bold">
                  {editing ? "Editar cliente" : "Novo cliente"}
                </h2>
                <p className="text-sm text-slate-500">
                  Preencha os dados cadastrais.
                </p>
              </div>
              <button
                aria-label="Fechar"
                disabled={saving}
                onClick={() => setModalOpen(false)}
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={(e) => void submit(e)} className="overflow-y-auto">
              <div className="grid gap-4 p-5 sm:grid-cols-2">
                <label className="block space-y-1.5 text-sm font-medium text-slate-700 sm:col-span-2">
                  <span>Tipo de cliente</span>
                  <select
                    disabled={!!editing}
                    value={form.kind}
                    onChange={(e) =>
                      setForm({
                        ...INITIAL,
                        kind: e.target.value as "pf" | "pj",
                      })
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"
                  >
                    <option value="pf">Pessoa física</option>
                    <option value="pj">Pessoa jurídica</option>
                  </select>
                </label>
                {form.kind === "pf" ? (
                  <>
                    {field("full_name", "Nome completo", { required: true })}
                    {field("cpf", "CPF", {
                      maxLength: 14,
                      placeholder: "Somente números",
                    })}
                  </>
                ) : (
                  <>
                    {field("company_name", "Razão social", { required: true })}
                    {field("trade_name", "Nome fantasia")}
                    {field("cnpj", "CNPJ", {
                      required: true,
                      maxLength: 18,
                      placeholder: "Somente números",
                    })}
                    {field("contact_name", "Pessoa de contato")}
                  </>
                )}
                {field("email", "E-mail", { type: "email" })}
                {field("phone", "Telefone")}
                {field("city", "Cidade")}
                {field("state_code", "UF", { maxLength: 2 })}
                <label className="space-y-1.5 text-sm font-medium text-slate-700 sm:col-span-2">
                  <span>Observações</span>
                  <textarea
                    rows={3}
                    value={form.notes}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, notes: e.target.value }))
                    }
                    className="w-full rounded-lg border border-slate-300 p-3 text-sm"
                  />
                </label>
              </div>
              {formError && (
                <p
                  role="alert"
                  className="mx-5 mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700"
                >
                  {formError}
                </p>
              )}
              <div className="flex justify-end gap-3 border-t border-slate-200 p-5">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={
                    saving ||
                    (!!formError &&
                      formError.includes("Não foi possível carregar"))
                  }
                  className="rounded-lg bg-blue-700 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {saving ? "Salvando..." : "Salvar cliente"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      <p className="text-xs text-slate-500">
        A busca e os filtros atuam apenas nos registros da página carregada. A
        consulta global com filtros no servidor será adicionada em uma próxima
        versão.{" "}
        {profile?.role === "editor"
          ? "Como editor, você pode desativar registros, mas não excluí-los definitivamente."
          : ""}
      </p>
    </div>
  );
}
