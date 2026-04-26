import { useEffect, useState } from "react";
import { api } from "../../lib/api";

interface Lancamento {
  id: string;
  data: string;
  tipo: "receita" | "despesa";
  categoria: string;
  descricao: string | null;
  valor_cents: number;
  status: "confirmado" | "pendente";
  origem: "manual" | "agenda";
}

interface ResumoMensal {
  total_receitas_cents: number;
  total_despesas_cents: number;
  saldo_cents: number;
}

interface LancamentosResponse {
  lancamentos: Lancamento[];
  total: number;
}

export interface LancamentosListaProps {
  mes: number;
  ano: number;
  onMesChange: (mes: number, ano: number) => void;
  onEditLancamento: (l: Lancamento) => void;
  onNovoLancamento: () => void;
  refreshKey?: number;
}

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function brl(cents: number): string {
  return BRL.format(cents / 100);
}

function fmtData(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

const CATEGORIA_LABELS: Record<string, string> = {
  venda_produto: "Venda de produto",
  prestacao_servico: "Prestação de serviço",
  outros_receita: "Outras receitas",
  aluguel: "Aluguel",
  material: "Material",
  transporte: "Transporte",
  alimentacao: "Alimentação",
  marketing: "Marketing",
  das: "DAS",
  outros_despesa: "Outras despesas",
};

const PAGE_SIZE = 20;

export function LancamentosLista({
  mes,
  ano,
  onMesChange,
  onEditLancamento,
  onNovoLancamento,
  refreshKey = 0,
}: LancamentosListaProps) {
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [total, setTotal] = useState(0);
  const [resumo, setResumo] = useState<ResumoMensal | null>(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setOffset(0);
    setLancamentos([]);
  }, [mes, ano, refreshKey]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    Promise.all([
      api.get<LancamentosResponse>(
        `/financeiro/lancamentos?mes=${mes}&ano=${ano}&limit=${PAGE_SIZE}&offset=${offset}`
      ),
      api.get<ResumoMensal & { mes: number; ano: number }>(
        `/financeiro/lancamentos/resumo?mes=${mes}&ano=${ano}`
      ),
    ])
      .then(([resp, res]) => {
        if (cancelled) return;
        if (offset === 0) {
          setLancamentos(resp.lancamentos);
        } else {
          setLancamentos((prev) => [...prev, ...resp.lancamentos]);
        }
        setTotal(resp.total);
        setResumo(res);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Erro ao carregar lançamentos.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [mes, ano, offset, refreshKey]);

  function navMes(delta: number) {
    let novoMes = mes + delta;
    let novoAno = ano;
    if (novoMes < 1) { novoMes = 12; novoAno--; }
    if (novoMes > 12) { novoMes = 1; novoAno++; }
    onMesChange(novoMes, novoAno);
  }

  const hasMore = lancamentos.length < total;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navMes(-1)}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
            aria-label="Mês anterior"
          >
            ◀
          </button>
          <h2 className="text-sm font-semibold text-gray-900 min-w-[120px] text-center">
            {MESES[mes - 1]} {ano}
          </h2>
          <button
            onClick={() => navMes(1)}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
            aria-label="Próximo mês"
          >
            ▶
          </button>
        </div>
        <button
          onClick={onNovoLancamento}
          className="flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
        >
          + Lançamento
        </button>
      </div>

      {/* Totais */}
      {resumo && (
        <div className="grid grid-cols-3 gap-0 border-b border-gray-100">
          <div className="px-6 py-3 text-center border-r border-gray-100">
            <p className="text-xs text-gray-500 mb-0.5">Receitas</p>
            <p className="text-sm font-semibold text-green-600">{brl(resumo.total_receitas_cents)}</p>
          </div>
          <div className="px-6 py-3 text-center border-r border-gray-100">
            <p className="text-xs text-gray-500 mb-0.5">Despesas</p>
            <p className="text-sm font-semibold text-red-600">{brl(resumo.total_despesas_cents)}</p>
          </div>
          <div className="px-6 py-3 text-center">
            <p className="text-xs text-gray-500 mb-0.5">Saldo</p>
            <p className={`text-sm font-semibold ${resumo.saldo_cents >= 0 ? "text-green-700" : "text-red-700"}`}>
              {brl(resumo.saldo_cents)}
            </p>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && lancamentos.length === 0 && (
        <div className="p-6 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex justify-between items-center animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-24" />
              <div className="h-4 bg-gray-200 rounded w-20" />
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-6 text-sm text-red-600">{error}</div>
      )}

      {/* Lista */}
      {!loading && lancamentos.length === 0 && !error && (
        <div className="p-6 text-center text-sm text-gray-400">
          Nenhum lançamento em {MESES[mes - 1]}/{ano}.
        </div>
      )}

      <ul className="divide-y divide-gray-50">
        {lancamentos.map((l) => (
          <li
            key={l.id}
            onClick={() => onEditLancamento(l)}
            className="flex items-center gap-3 px-6 py-3 hover:bg-gray-50 cursor-pointer transition-colors"
          >
            <span className={`text-base ${l.tipo === "receita" ? "text-green-600" : "text-red-500"}`}>
              {l.tipo === "receita" ? "↑" : "↓"}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {l.descricao || CATEGORIA_LABELS[l.categoria] || l.categoria}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-xs text-gray-400">{fmtData(l.data)}</p>
                {l.origem === "agenda" && (
                  <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">Agenda</span>
                )}
                {l.status === "pendente" && (
                  <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded">⏳ Pendente</span>
                )}
              </div>
            </div>
            <span className={`text-sm font-semibold tabular-nums ${l.tipo === "receita" ? "text-green-700" : "text-red-600"}`}>
              {l.tipo === "receita" ? "+" : "-"}{brl(l.valor_cents)}
            </span>
          </li>
        ))}
      </ul>

      {/* Carregar mais */}
      {hasMore && (
        <div className="px-6 py-4 border-t border-gray-100 text-center">
          <button
            onClick={() => setOffset((o) => o + PAGE_SIZE)}
            disabled={loading}
            className="text-sm text-blue-600 hover:underline disabled:opacity-50"
          >
            {loading ? "Carregando..." : `Carregar mais (${total - lancamentos.length} restantes)`}
          </button>
        </div>
      )}
    </div>
  );
}
