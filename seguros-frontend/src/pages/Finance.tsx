import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CircleDollarSign, Plus, RefreshCw, Search, X } from "lucide-react";
import type { Policy } from "@/services/policies";
import {
  cancelInstallment,
  createInstallment,
  listFinancePolicies,
  listInstallments,
  payInstallment,
  undoPayment,
  type Installment,
  type InstallmentForm,
} from "@/services/finance";

const blank: InstallmentForm = {
  policy_id: "",
  installment_number: "1",
  amount: "",
  due_date: "",
  notes: "",
};
const money = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    n,
  );
const date = (s: string) => {
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
};
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}; // calendário local
const activeStatus = (
  i: Installment,
): "paga" | "cancelada" | "atrasada" | "pendente" => {
  if (i.status === "paga") return "paga";
  if (i.status === "cancelada") return "cancelada";
  return i.due_date < today() ? "atrasada" : "pendente";
};
const statusColors = {
  paga: "bg-emerald-50 text-emerald-700",
  cancelada: "bg-slate-100 text-slate-600",
  atrasada: "bg-red-50 text-red-700",
  pendente: "bg-amber-50 text-amber-800",
};
const inputStyle =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

export default function Finance() {
  const [items, setItems] = useState<Installment[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [filter, setFilter] = useState("all");
  const [policyFilter, setPolicyFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState<"create" | "pay" | null>(null);
  const [selected, setSelected] = useState<Installment | null>(null);
  const [form, setForm] = useState<InstallmentForm>(blank);
  const [paidDate, setPaidDate] = useState(today());
  const [paidAmount, setPaidAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [reference, setReference] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listInstallments(), listFinancePolicies()])
      .then(([i, p]) => {
        if (!cancelled) {
          setItems(i);
          setPolicies(p);
          setError("");
        }
      })
      .catch((e) => {
        if (!cancelled)
          setError(
            e instanceof Error ? e.message : "Falha ao carregar financeiro",
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const policyMap = useMemo(
    () => Object.fromEntries(policies.map((p) => [p.id, p])),
    [policies],
  );
  const visible = useMemo(
    () =>
      items
        .filter((i) => {
          const p = policyMap[i.policy_id];
          const needle = query.toLocaleLowerCase("pt-BR").trim();
          return (
            i.is_active &&
            (filter === "all" || activeStatus(i) === filter) &&
            (policyFilter === "all" || i.policy_id === policyFilter) &&
            (!needle ||
              [i.installment_number, p?.policy_number, p?.insurer_name]
                .join(" ")
                .toLocaleLowerCase("pt-BR")
                .includes(needle))
          );
        })
        .sort((a, b) => a.due_date.localeCompare(b.due_date)),
    [items, policyMap, query, filter, policyFilter],
  );

  // Totais consideram todas as parcelas ativas carregadas, independentemente dos filtros locais.
  const active = items.filter((i) => i.is_active);
  const pending = active.filter((i) => i.status === "pendente");
  const due = pending.filter((i) => i.due_date < today());
  const paid = active.filter((i) => i.status === "paga");
  const totals = [
    {
      label: "A receber",
      value: money(pending.reduce((s, i) => s + Number(i.amount), 0)),
      color: "text-blue-700",
    },
    {
      label: "Em atraso",
      value: money(due.reduce((s, i) => s + Number(i.amount), 0)),
      color: "text-red-700",
    },
    {
      label: "Recebido",
      value: money(paid.reduce((s, i) => s + Number(i.paid_amount || 0), 0)),
      color: "text-emerald-700",
    },
    {
      label: "Parcelas atrasadas",
      value: String(due.length),
      color: "text-slate-900",
    }
  ];

  const refresh = () => {
    setLoading(true);
    setReload((n) => n + 1);
  };
  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormError("");
    try {
      await createInstallment(form);
      setModal(null);
      refresh();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Falha ao criar parcela");
    } finally {
      setBusy(false);
    }
  }
  async function pay(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setBusy(true);
    setFormError("");
    try {
      await payInstallment(
        selected,
        paidDate,
        paidAmount,
        paymentMethod,
        reference,
      );
      setModal(null);
      refresh();
    } catch (e) {
      setFormError(
        e instanceof Error ? e.message : "Falha ao registrar pagamento",
      );
    } finally {
      setBusy(false);
    }
  }
  async function action(item: Installment, kind: "undo" | "cancel") {
    const prompt =
      kind === "undo"
        ? "Deseja estornar a baixa desta parcela?"
        : "Deseja cancelar esta parcela pendente?";
    if (!window.confirm(prompt)) return;
    setBusy(true);
    setError("");
    try {
      if (kind === "undo") await undoPayment(item);
      else await cancelInstallment(item);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao atualizar parcela");
    } finally {
      setBusy(false);
    }
  }

  function openCreate() {
    setForm(blank);
    setFormError("");
    setModal("create");
  }

  function openPay(item: Installment) {
    setSelected(item);
    setPaidDate(today());
    setPaidAmount(String(item.amount));
    setPaymentMethod("");
    setReference("");
    setFormError("");
    setModal("pay");
  }
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-blue-700">Gestão financeira</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">
            Parcelas e recebimentos
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Vencimentos e pagamentos das apólices.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"
        >
          <Plus size={17} /> Nova parcela
        </button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {totals.map((t) => (
          <div
            key={t.label}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <p className="text-sm text-slate-500">{t.label}</p>
            <p className={`mt-3 text-2xl font-bold tracking-tight ${t.color}`}>
              {loading ? "..." : t.value}
            </p>
          </div>
        ))}
      </div>
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-4">
          <div className="relative min-w-52 flex-1">
            <Search
              size={17}
              className="absolute left-3 top-3 text-slate-400"
            />
            <input
              className={`${inputStyle} pl-9`}
              placeholder="Buscar por número ou seguradora..."
              aria-label="Buscar parcelas"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <select
            className={inputStyle + " sm:w-auto"}
            aria-label="Filtrar status"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">Todos os status</option>
            <option value="pendente">Pendente</option>
            <option value="atrasada">Atrasada</option>
            <option value="paga">Paga</option>
            <option value="cancelada">Cancelada</option>
          </select>
          <select
            className={inputStyle + " sm:max-w-56"}
            aria-label="Filtrar apólice"
            value={policyFilter}
            onChange={(e) => setPolicyFilter(e.target.value)}
          >
            <option value="all">Todas as apólices</option>
            {policies.map((p) => (
              <option key={p.id} value={p.id}>
                {p.policy_number}
              </option>
            ))}
          </select>
          <button
            onClick={refresh}
            aria-label="Atualizar dados"
            className="rounded-lg border border-slate-200 p-2.5 hover:bg-slate-50"
          >
            <RefreshCw size={18} />
          </button>
        </div>
        {error && (
          <p
            role="alert"
            className="m-4 rounded-lg bg-red-50 p-3 text-sm text-red-700"
          >
            {error}
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                {[
                  "Apólice",
                  "Parcela",
                  "Vencimento",
                  "Valor",
                  "Situação",
                  "Ações",
                ].map((h) => (
                  <th key={h} className="px-5 py-4">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map((i) => (
                <tr key={i.id} className="hover:bg-slate-50">
                  <td className="px-5 py-4">
                    <p className="font-semibold text-slate-900">
                      {policyMap[i.policy_id]?.policy_number ||
                        "Apólice não encontrada"}
                    </p>
                    <p className="text-xs text-slate-500">
                      {policyMap[i.policy_id]?.insurer_name}
                    </p>
                  </td>
                  <td className="px-5 py-4">{i.installment_number}</td>
                  <td className="px-5 py-4">{date(i.due_date)}</td>
                  <td className="px-5 py-4 font-semibold">
                    {money(Number(i.amount))}
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusColors[activeStatus(i)]}`}
                    >
                      {activeStatus(i)}
                    </span>
                    {i.status === "paga" && (
                      <p className="mt-1 text-xs text-slate-500">
                        Recebido {money(Number(i.paid_amount || 0))}
                      </p>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex gap-2">
                      {i.status === "pendente" && (
                        <>
                          <button
                            disabled={busy}
                            onClick={() => openPay(i)}
                            className="rounded-lg border border-blue-200 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                          >
                            Registrar pagamento
                          </button>
                          <button
                            disabled={busy}
                            onClick={() => void action(i, "cancel")}
                            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600"
                          >
                            Cancelar
                          </button>
                        </>
                      )}
                      {i.status === "paga" && (
                        <button
                          disabled={busy}
                          onClick={() => void action(i, "undo")}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-700"
                        >
                          Estornar baixa
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {loading ? (
            <p className="p-10 text-center text-sm text-slate-500">
              Carregando...
            </p>
          ) : visible.length === 0 ? (
            <p className="p-10 text-center text-sm text-slate-500">
              Nenhuma parcela encontrada.
            </p>
          ) : null}
        </div>
        <div className="border-t border-slate-100 px-5 py-4 text-sm text-slate-500">
          {visible.length} parcelas exibidas · filtros locais
        </div>
      </section>
      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={
              modal === "create" ? "Nova parcela" : "Registrar pagamento"
            }
            className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl"
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-bold">
                <CircleDollarSign size={20} className="text-blue-700" />
                {modal === "create" ? "Nova parcela" : "Registrar pagamento"}
              </h2>
              <button
                aria-label="Fechar"
                onClick={() => setModal(null)}
                disabled={busy}
              >
                <X size={20} />
              </button>
            </div>
            <form
              className="space-y-4"
              onSubmit={modal === "create" ? create : pay}
            >
              {modal === "create" ? (
                <>
                  <label className="block space-y-1 text-sm font-medium">
                    Apólice
                    <select
                      required
                      className={inputStyle}
                      value={form.policy_id}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, policy_id: e.target.value }))
                      }
                    >
                      <option value="">Selecione uma apólice</option>
                      {policies
                        .filter((p) => p.is_active)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.policy_number} — {p.insurer_name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="space-y-1 text-sm font-medium">
                      Nº parcela
                      <input
                        required
                        min="1"
                        step="1"
                        type="number"
                        className={inputStyle}
                        value={form.installment_number}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            installment_number: e.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="space-y-1 text-sm font-medium">
                      Valor (R$)
                      <input
                        required
                        type="text"
                        inputMode="decimal"
                        placeholder="350.50"
                        className={inputStyle}
                        value={form.amount}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, amount: e.target.value }))
                        }
                      />
                    </label>
                  </div>
                  <label className="block space-y-1 text-sm font-medium">
                    Vencimento
                    <input
                      required
                      type="date"
                      className={inputStyle}
                      value={form.due_date}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, due_date: e.target.value }))
                      }
                    />
                  </label>
                  <label className="block space-y-1 text-sm font-medium">
                    Observações
                    <textarea
                      className={inputStyle}
                      value={form.notes}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, notes: e.target.value }))
                      }
                    />
                  </label>
                </>
              ) : (
                <>
                  <p className="text-sm text-slate-500">
                    Apólice{" "}
                    {selected && policyMap[selected.policy_id]?.policy_number} ·
                    Parcela {selected?.installment_number}
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="space-y-1 text-sm font-medium">
                      Data do pagamento
                      <input
                        required
                        type="date"
                        className={inputStyle}
                        value={paidDate}
                        onChange={(e) => setPaidDate(e.target.value)}
                      />
                    </label>
                    <label className="space-y-1 text-sm font-medium">
                      Valor recebido (R$)
                      <input
                        required
                        inputMode="decimal"
                        className={inputStyle}
                        value={paidAmount}
                        onChange={(e) => setPaidAmount(e.target.value)}
                      />
                    </label>
                  </div>
                  <label className="block space-y-1 text-sm font-medium">
                    Forma de pagamento
                    <input
                      className={inputStyle}
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      placeholder="PIX, boleto, transferência..."
                    />
                  </label>
                  <label className="block space-y-1 text-sm font-medium">
                    Referência / comprovante
                    <input
                      className={inputStyle}
                      value={reference}
                      onChange={(e) => setReference(e.target.value)}
                    />
                  </label>
                </>
              )}
              {formError && (
                <p
                  role="alert"
                  className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
                >
                  {formError}
                </p>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setModal(null)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm"
                >
                  Voltar
                </button>
                <button
                  disabled={busy}
                  type="submit"
                  className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {busy ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
