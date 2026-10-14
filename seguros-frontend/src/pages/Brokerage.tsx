import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  getBrokerageOverview,
  registerBrokerageReceipt,
  type BrokerageRow,
  type BrokerageMonth,
} from "@/services/brokerage";

const brl = (value: number | null | undefined) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number(value ?? 0),
  );
const shortDate = (value: string) => value.split("-").reverse().join("/");

export default function Brokerage() {
  const [rows, setRows] = useState<BrokerageRow[]>([]);
  const [months, setMonths] = useState<BrokerageMonth[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("todos");
  const [search, setSearch] = useState("");

  const refresh = useCallback(async () => {
    const result = await getBrokerageOverview();
    setRows(result.rows);
    setMonths(result.monthly);
    setUpdatedAt(new Date());
    setError("");
  }, []);

  useEffect(() => {
    let active = true;
    let requestNumber = 0;
    const fetchLatest = async () => {
      const request = ++requestNumber;
      try {
        const result = await getBrokerageOverview();
        if (!active || request !== requestNumber) return;
        setRows(result.rows);
        setMonths(result.monthly);
        setUpdatedAt(new Date());
        setError("");
      } catch (err) {
        if (active && request === requestNumber) {
          setError(
            err instanceof Error
              ? err.message
              : "Falha ao carregar agenciamentos",
          );
        }
      } finally {
        if (active && request === requestNumber) setLoading(false);
      }
    };
    const onFocus = () => {
      void fetchLatest();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void fetchLatest();
    };
    void fetchLatest();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void fetchLatest();
    }, 30000);
    return () => {
      active = false;
      requestNumber++;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  async function manualRefresh() {
    setRefreshing(true);
    try {
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao atualizar");
    } finally {
      setRefreshing(false);
    }
  }

  const visible = useMemo(
    () =>
      rows.filter((row) => {
        const statusMatch =
          filter === "todos" ||
          (filter === "atrasada" ? row.is_overdue : row.status === filter);
        const term = search.trim().toLocaleLowerCase("pt-BR");
        return (
          statusMatch &&
          (!term ||
            `${row.policy_number} ${row.insurer_name}`
              .toLocaleLowerCase("pt-BR")
              .includes(term))
        );
      }),
    [rows, filter, search],
  );

  const totalPending = rows
    .filter((row) => row.status === "pendente")
    .reduce((sum, row) => sum + Number(row.amount), 0);
  const totalOverdue = rows
    .filter((row) => row.is_overdue)
    .reduce((sum, row) => sum + Number(row.amount), 0);
  const totalReceived = rows
    .filter((row) => row.status === "recebida")
    .reduce((sum, row) => sum + Number(row.received_amount ?? 0), 0);

  async function updateReceipt(row: BrokerageRow) {
    const shouldReceive = row.status === "pendente";
    if (
      !window.confirm(
        shouldReceive
          ? `Confirmar recebimento da parcela ${row.installment_number} da apólice ${row.policy_number}?`
          : `Estornar recebimento da parcela ${row.installment_number} da apólice ${row.policy_number}?`,
      )
    )
      return;
    setWorking(row.id);
    setError("");
    try {
      await registerBrokerageReceipt(row.id, shouldReceive);
      await refresh();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Não foi possível atualizar o recebimento",
      );
    } finally {
      setWorking(null);
    }
  }

  return (
    <main className="space-y-6 p-4 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Financeiro da corretora
          </h1>
          <p className="text-sm text-slate-500">
            Agenciamentos previstos e recebidos. Não inclui parcelas pagas pelo
            segurado.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {updatedAt
              ? `Atualizado às ${updatedAt.toLocaleTimeString("pt-BR")}`
              : "Aguardando dados..."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void manualRefresh()}
          disabled={refreshing || loading}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
        >
          {refreshing ? "Atualizando..." : "Atualizar indicadores"}
        </button>
      </div>
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          {error}{" "}
          <button
            type="button"
            onClick={() => void manualRefresh()}
            className="ml-3 underline"
          >
            Tentar novamente
          </button>
        </div>
      )}
      {loading ? (
        <p className="text-slate-500">Carregando agenciamentos...</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              ["A receber", totalPending],
              ["Em atraso", totalOverdue],
              ["Recebido", totalReceived],
            ].map(([label, amount]) => (
              <div
                key={label}
                className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <p className="text-sm text-slate-500">{label}</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {brl(Number(amount))}
                </p>
              </div>
            ))}
          </div>
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-lg font-semibold text-slate-900">
              Previsão mensal x recebimento realizado
            </h2>
            <p className="mb-4 text-xs text-slate-500">
              Previsto por mês de vencimento; realizado por mês em que o
              dinheiro foi recebido.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="p-2">Mês</th>
                    <th className="p-2">Previsto</th>
                    <th className="p-2">Recebido</th>
                    <th className="p-2">Pendentes</th>
                  </tr>
                </thead>
                <tbody>
                  {months.map((item) => (
                    <tr className="border-t border-slate-100" key={item.month}>
                      <td className="p-2">
                        {item.month.slice(0, 7).split("-").reverse().join("/")}
                      </td>
                      <td className="p-2">{brl(item.expected_amount)}</td>
                      <td className="p-2">{brl(item.received_amount)}</td>
                      <td className="p-2">{item.pending_installments}</td>
                    </tr>
                  ))}
                  {months.length === 0 && (
                    <tr>
                      <td className="p-4 text-slate-500" colSpan={4}>
                        Nenhum agenciamento configurado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                Parcelas de agenciamento
              </h2>
              <div className="flex flex-wrap gap-2">
                <input
                  aria-label="Pesquisar apólices"
                  className="rounded-md border border-slate-300 p-2 text-sm"
                  placeholder="Número ou seguradora"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <select
                  aria-label="Filtrar situação"
                  className="rounded-md border border-slate-300 p-2 text-sm"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="todos">Todas</option>
                  <option value="pendente">Pendentes</option>
                  <option value="atrasada">Em atraso</option>
                  <option value="recebida">Recebidas</option>
                  <option value="cancelada">Canceladas</option>
                </select>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="p-2">Apólice</th>
                    <th className="p-2">Parcela</th>
                    <th className="p-2">Vencimento</th>
                    <th className="p-2">Valor</th>
                    <th className="p-2">Situação</th>
                    <th className="p-2">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => (
                    <tr key={row.id} className="border-t border-slate-100">
                      <td className="p-2">
                        <Link
                          className="text-blue-700 hover:underline"
                          to={`/apolices/${row.policy_id}/financeiro`}
                        >
                          {row.policy_number}
                        </Link>
                        <p className="text-xs text-slate-500">
                          {row.insurer_name}
                        </p>
                      </td>
                      <td className="p-2">{row.installment_number}</td>
                      <td className="p-2">{shortDate(row.due_date)}</td>
                      <td className="p-2">{brl(row.amount)}</td>
                      <td className="p-2">
                        {row.is_overdue
                          ? "Atrasada"
                          : row.status === "recebida"
                            ? "Recebida"
                            : row.status === "cancelada"
                              ? "Cancelada"
                              : "Pendente"}
                      </td>
                      <td className="p-2">
                        {row.status !== "cancelada" && (
                          <button
                            type="button"
                            disabled={working !== null}
                            className="font-medium text-blue-700 hover:underline disabled:opacity-50"
                            onClick={() => void updateReceipt(row)}
                          >
                            {working === row.id
                              ? "Salvando..."
                              : row.status === "recebida"
                                ? "Estornar"
                                : "Registrar recebimento"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {visible.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-4 text-slate-500">
                        Nenhuma parcela encontrada.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
