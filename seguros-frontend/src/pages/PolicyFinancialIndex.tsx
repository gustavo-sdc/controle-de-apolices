import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listPolicies, type Policy } from "@/services/policies";

export default function PolicyFinancialIndex() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const limit = 20;

  useEffect(() => {
    let cancelled = false;
    listPolicies(offset, limit)
      .then((page) => {
        if (cancelled) return;
        setPolicies(page.data);
        setTotal(page.pagination.total);
        setError("");
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "Erro ao carregar apólices",
        );
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [offset]);

  const filtered = policies.filter((p) =>
    [p.policy_number, p.insurer_name, p.insurance_type].some((v) =>
      (v ?? "").toLowerCase().includes(search.toLowerCase().trim()),
    ),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Financeiro das apólices
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Selecione uma apólice para configurar prêmio líquido, pagamento, juros
          e agenciamento.
        </p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <label
          htmlFor="buscar-apolice"
          className="mb-2 block text-sm font-medium text-slate-700"
        >
          Buscar nesta página
        </label>
        <input
          id="buscar-apolice"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Número, seguradora ou ramo"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-blue-600"
        />
        {error && (
          <p role="alert" className="mt-4 text-sm text-red-700">
            {error}
          </p>
        )}
        {loading ? (
          <p className="mt-5 text-sm text-slate-500">Carregando apólices...</p>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-slate-500">
                  <th className="px-3 py-3">Número</th>
                  <th className="px-3 py-3">Seguradora</th>
                  <th className="px-3 py-3">Ramo</th>
                  <th className="px-3 py-3">Situação</th>
                  <th className="px-3 py-3 text-right">Ação</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="px-3 py-3 font-medium">{p.policy_number}</td>
                    <td className="px-3 py-3">{p.insurer_name}</td>
                    <td className="px-3 py-3">{p.insurance_type}</td>
                    <td className="px-3 py-3 capitalize">{p.status}</td>
                    <td className="px-3 py-3 text-right">
                      <Link
                        className="font-medium text-blue-700 hover:underline"
                        to={`/apolices/${p.id}/financeiro`}
                      >
                        Abrir financeiro
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && !error && (
              <p className="py-8 text-center text-sm text-slate-500">
                Nenhuma apólice encontrada nesta página.
              </p>
            )}
          </div>
        )}
        <div className="mt-4 flex items-center justify-between gap-3 text-sm text-slate-500">
          <span>{total} apólice(s) no total</span>
          <div className="flex gap-2">
            <button
              className="rounded-lg border px-3 py-2 disabled:opacity-40"
              disabled={loading || offset === 0}
              onClick={() => {
                setLoading(true);
                setOffset((o) => Math.max(0, o - limit));
              }}
            >
              Anterior
            </button>
            <button
              className="rounded-lg border px-3 py-2 disabled:opacity-40"
              disabled={loading || offset + limit >= total}
              onClick={() => {
                setLoading(true);
                setOffset((o) => o + limit);
              }}
            >
              Próxima
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
