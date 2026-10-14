import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useParams, Link } from "react-router-dom";
import {
  financialDetail,
  saveFinancials,
  saveBrokerage,
  setReceipt,
  monthlyBrokerage,
  type MonthlySummary,
  type FinancialDetail,
  type FinancialInput,
  type PaymentMethod,
} from "@/services/policyFinancials";

const label = "flex flex-col gap-1 text-sm font-medium text-slate-700";
const input =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-blue-600";
const money = (n: number | null | undefined) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number(n || 0),
  );
const date = (s: string) => s.split("-").reverse().join("/");
const isSplit = (v: PaymentMethod) =>
  [
    "cartao_parcelado",
    "debito_automatico_parcelado",
    "boleto_parcelado",
  ].includes(v);
const defaults: FinancialInput = {
  net_premium: 0,
  payment_method: "pix",
  client_installments: 1,
  interest_applies: false,
  interest_amount: 0,
  first_due_date: "",
  agency_percentage: 0,
  agency_installments: 1,
  agency_first_date: "",
};
export default function PolicyFinancials() {
  const { id = "" } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<FinancialDetail | null>(null);
  const [form, setForm] = useState<FinancialInput>(defaults);
  const [loading, setLoading] = useState(true);
  const [monthly, setMonthly] = useState<MonthlySummary[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    const d = await financialDetail(id);
    setDetail(d);
    void monthlyBrokerage()
      .then(setMonthly)
      .catch(() => {});
    setForm({
      net_premium: Number(d.policy.net_premium_amount ?? 0),
      payment_method: d.payment?.payment_method ?? "pix",
      client_installments: d.payment?.installments ?? 1,
      interest_applies: d.payment?.interest_applies ?? false,
      interest_amount: Number(d.payment?.interest_amount ?? 0),
      first_due_date: d.payment?.first_due_date ?? "",
      agency_percentage: Number(d.agreement?.agency_percentage ?? 0),
      agency_installments: d.agreement?.installments ?? 1,
      agency_first_date: d.agreement?.first_receipt_date ?? "",
    });
  }, [id]);
  useEffect(() => {
    let ignore = false;
    void monthlyBrokerage()
      .then((items) => {
        if (!ignore) setMonthly(items);
      })
      .catch(() => {});
    financialDetail(id)
      .then((d) => {
        if (ignore) return;
        setDetail(d);
        setForm({
          net_premium: Number(d.policy.net_premium_amount ?? 0),
          payment_method: d.payment?.payment_method ?? "pix",
          client_installments: d.payment?.installments ?? 1,
          interest_applies: d.payment?.interest_applies ?? false,
          interest_amount: Number(d.payment?.interest_amount ?? 0),
          first_due_date: d.payment?.first_due_date ?? "",
          agency_percentage: Number(d.agreement?.agency_percentage ?? 0),
          agency_installments: d.agreement?.installments ?? 1,
          agency_first_date: d.agreement?.first_receipt_date ?? "",
        });
        setLoading(false);
      })
      .catch((e) => {
        if (!ignore) {
          setError(e instanceof Error ? e.message : "Erro ao carregar");
          setLoading(false);
        }
      });
    return () => {
      ignore = true;
    };
  }, [id]);
  const change = <K extends keyof FinancialInput>(k: K, v: FinancialInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await saveFinancials(id, form);
      await load();
      setMessage("Condições financeiras salvas com sucesso.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  }
  async function saveAgency() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      if (
        !Number.isInteger(form.agency_installments) ||
        form.agency_installments < 1 ||
        !form.agency_first_date
      )
        throw new Error(
          "Informe a quantidade de parcelas e o primeiro recebimento previsto.",
        );
      await saveBrokerage(id, form);
      await load();
      setMessage(
        "Agenciamento salvo. As parcelas do segurado foram preservadas.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar agenciamento");
    } finally {
      setSaving(false);
    }
  }
  async function receipt(item: { id: string; status: string }) {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await setReceipt(item.id, item.status !== "recebida");
      await load();
      setMessage("Recebimento atualizado.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na baixa");
    } finally {
      setSaving(false);
    }
  }
  const existingLegacy = Boolean(
    detail && detail.client_schedule.length > 0 && !detail.payment,
  );
  const existingSettled = Boolean(
    detail && detail.client_schedule.some((i) => i.status !== "pendente"),
  );
  const clientLocked = existingLegacy || existingSettled;
  const agencyValue =
    Math.round(form.net_premium * form.agency_percentage) / 100;
  return (
    <div className="space-y-6 p-4 lg:p-8">
      <div>
        <Link to="/apolices" className="text-sm text-blue-700">
          ← Voltar às apólices
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">
          Financeiro da apólice {detail?.policy.policy_number ?? ""}
        </h1>
        <p className="text-slate-500">
          Prêmio do cliente e agenciamento da corretora são controles separados.
        </p>
      </div>
      {loading && <p>Carregando...</p>}
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-700"
        >
          {error}
        </p>
      )}
      {message && (
        <p
          role="status"
          className="rounded-lg border border-green-200 bg-green-50 p-3 text-green-700"
        >
          {message}
        </p>
      )}
      {!loading && detail && (
        <form onSubmit={(e) => void save(e)} className="space-y-6">
          <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">
              1. Financeiro da apólice / segurado
            </h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-sm text-slate-500">Prêmio total</p>
                <strong>{money(detail.policy.premium_amount)}</strong>
                <p className="text-xs text-slate-400">Edite na apólice</p>
              </div>
              <div>
                <p className="text-sm text-slate-500">Capital segurado</p>
                <strong>{money(detail.policy.coverage_amount)}</strong>
              </div>
              <div>
                <p className="text-sm text-slate-500">Franquia</p>
                <strong>{money(detail.policy.deductible_amount)}</strong>
              </div>
              <label className={label}>
                Prêmio líquido (R$)
                <input
                  className={input}
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={form.net_premium}
                  onChange={(e) =>
                    change("net_premium", Number(e.target.value))
                  }
                />
              </label>
              <label className={label}>
                Forma de pagamento
                <select
                  className={input}
                  value={form.payment_method}
                  onChange={(e) => {
                    const method = e.target.value as PaymentMethod;
                    setForm((f) => ({
                      ...f,
                      payment_method: method,
                      client_installments: isSplit(method)
                        ? f.client_installments
                        : 1,
                    }));
                  }}
                >
                  <option value="cartao_parcelado">
                    Parcelado no cartão de crédito
                  </option>
                  <option value="debito_automatico_parcelado">
                    Parcelado no débito automático
                  </option>
                  <option value="boleto_parcelado">Parcelado no boleto</option>
                  <option value="cartao_a_vista">
                    À vista no cartão de crédito
                  </option>
                  <option value="debito">Débito</option>
                  <option value="pix">Pix</option>
                </select>
              </label>
              <label className={label}>
                Quantidade de parcelas
                <input
                  className={input}
                  type="number"
                  min="1"
                  max="360"
                  step="1"
                  required
                  disabled={!isSplit(form.payment_method)}
                  value={form.client_installments}
                  onChange={(e) =>
                    change("client_installments", Number(e.target.value))
                  }
                />
              </label>
              <label className={label}>
                Primeiro vencimento
                <input
                  className={input}
                  type="date"
                  required
                  value={form.first_due_date}
                  onChange={(e) => change("first_due_date", e.target.value)}
                />
              </label>
              <label className={label}>
                Juros?
                <select
                  className={input}
                  value={form.interest_applies ? "sim" : "nao"}
                  onChange={(e) => {
                    const yes = e.target.value === "sim";
                    setForm((f) => ({
                      ...f,
                      interest_applies: yes,
                      interest_amount: yes ? f.interest_amount : 0,
                    }));
                  }}
                >
                  <option value="nao">Sem juros</option>
                  <option value="sim">Com juros</option>
                </select>
              </label>
              <label className={label}>
                Juros totais (R$)
                <input
                  className={input}
                  type="number"
                  min="0"
                  step="0.01"
                  disabled={!form.interest_applies}
                  value={form.interest_amount}
                  onChange={(e) =>
                    change("interest_amount", Number(e.target.value))
                  }
                />
              </label>
            </div>
            {clientLocked && (
              <p
                role="status"
                className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
              >
                Esta apólice possui parcelas antigas ou já pagas/canceladas. A
                reprogramação do segurado está bloqueada para preservar o
                histórico. O agenciamento pode ser salvo separadamente.
              </p>
            )}
            <p className="text-sm text-slate-500">
              Total programado:{" "}
              <strong>
                {money(
                  Number(detail.policy.premium_amount ?? 0) +
                    form.interest_amount,
                )}
              </strong>
              . Parcelas anteriores não serão apagadas.
            </p>
          </section>
          <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">
              2. Financeiro da corretora — Agenciamento
            </h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <label className={label}>
                Agenciamento (%)
                <input
                  className={input}
                  type="number"
                  min="0"
                  max="1000000"
                  step="0.0001"
                  required
                  value={form.agency_percentage}
                  onChange={(e) =>
                    change("agency_percentage", Number(e.target.value))
                  }
                />
              </label>
              <label className={label}>
                Parcelas a receber
                <input
                  className={input}
                  type="number"
                  min="1"
                  max="360"
                  step="1"
                  required
                  value={form.agency_installments}
                  onChange={(e) =>
                    change("agency_installments", Number(e.target.value))
                  }
                />
              </label>
              <label className={label}>
                Primeiro recebimento previsto
                <input
                  className={input}
                  type="date"
                  required
                  value={form.agency_first_date}
                  onChange={(e) => change("agency_first_date", e.target.value)}
                />
              </label>
            </div>
            <p className="text-sm text-slate-600">
              Agenciamento previsto: <strong>{money(agencyValue)}</strong> (
              {form.agency_percentage}% de {money(form.net_premium)}).
            </p>
            <p className="text-sm text-slate-500">
              O valor será distribuído mensalmente, ajustando centavos na última
              parcela.
            </p>
          </section>
          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={
                saving || clientLocked || detail.policy.premium_amount == null
              }
              className="rounded-lg bg-blue-700 px-5 py-2.5 font-semibold text-white disabled:opacity-50"
            >
              {saving
                ? "Salvando..."
                : "Salvar financeiro do segurado + agenciamento"}
            </button>
            <button
              type="button"
              onClick={() => void saveAgency()}
              disabled={saving}
              className="rounded-lg border border-blue-700 bg-white px-5 py-2.5 font-semibold text-blue-700 disabled:opacity-50"
            >
              Salvar somente agenciamento
            </button>
          </div>
        </form>
      )}
      {monthly.length > 0 && (
        <section className="rounded-xl border bg-white p-5">
          <h2 className="mb-3 text-lg font-semibold">
            Recebimentos mensais da corretora — todas as apólices
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th>Mês previsto</th>
                  <th>A receber</th>
                  <th>Recebido</th>
                  <th>Parcelas pendentes</th>
                </tr>
              </thead>
              <tbody>
                {monthly.map((row) => (
                  <tr className="border-t" key={row.month}>
                    <td>
                      {row.month.slice(0, 7).split("-").reverse().join("/")}
                    </td>
                    <td>{money(row.expected_amount)}</td>
                    <td>{money(row.received_amount)}</td>
                    <td>{row.pending_installments}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {detail && (
        <div className="grid gap-6 xl:grid-cols-2">
          <section className="rounded-xl border bg-white p-5">
            <h2 className="mb-3 text-lg font-semibold">Parcelas do segurado</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    <th>Nº</th>
                    <th>Vencimento</th>
                    <th>Valor</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.client_schedule.map((i) => (
                    <tr className="border-t" key={i.id}>
                      <td>{i.installment_number}</td>
                      <td>{date(i.due_date)}</td>
                      <td>{money(i.amount)}</td>
                      <td>{i.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="rounded-xl border bg-white p-5">
            <h2 className="mb-3 text-lg font-semibold">
              Agenciamento da corretora
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    <th>Nº</th>
                    <th>Previsto</th>
                    <th>Valor</th>
                    <th>Situação</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {detail.agency_schedule.map((i) => (
                    <tr className="border-t" key={i.id}>
                      <td>{i.installment_number}</td>
                      <td>{date(i.due_date)}</td>
                      <td>{money(i.amount)}</td>
                      <td>{i.status}</td>
                      <td>
                        <button
                          disabled={saving}
                          className="text-blue-700 underline"
                          onClick={() => void receipt(i)}
                        >
                          {i.status === "recebida" ? "Estornar" : "Receber"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
