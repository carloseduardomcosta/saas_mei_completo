import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { Sidebar } from "../components/ui/Sidebar";
import { Topbar } from "../components/ui/Topbar";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Termometro } from "../components/ui/Termometro";
import toast, { Toaster } from "react-hot-toast";

// ── Types ──────────────────────────────────────────────────────────────────

interface TermometroData {
  total_receitas_cents: number;
  limite_cents: number;
  percentual_usado: number;
  meses_ate_limite: number | null;
}

interface DASStatusData {
  competencia_mes: number;
  competencia_ano: number;
  status: "pago" | "pendente" | "vencido" | "nao_registrado";
  valor_cents: number | null;
  id?: string;
}

interface Lancamento {
  id: string;
  data: string;
  tipo: "receita" | "despesa";
  descricao: string | null;
  categoria: string;
  valor_cents: number;
}

interface ResumoMensal {
  total_receitas_cents: number;
  total_despesas_cents: number;
  saldo_cents: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
function brl(cents: number): string {
  return BRL.format(cents / 100);
}

function formatDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

const MESES = [
  "Jan","Fev","Mar","Abr","Mai","Jun",
  "Jul","Ago","Set","Out","Nov","Dez",
];

const DAS_STATUS_LABEL: Record<string, string> = {
  pago: "Pago",
  pendente: "Pendente",
  vencido: "Vencido",
  nao_registrado: "Não registrado",
};

const DAS_STATUS_BADGE: Record<string, "green" | "amber" | "red" | "gray"> = {
  pago: "green",
  pendente: "amber",
  vencido: "red",
  nao_registrado: "gray",
};

// ── Component ──────────────────────────────────────────────────────────────

export function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [termometro, setTermometro] = useState<TermometroData | null>(null);
  const [dasStatus, setDasStatus] = useState<DASStatusData | null>(null);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [resumo, setResumo] = useState<ResumoMensal | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const now = new Date();
    const mes = now.getMonth() + 1;
    const ano = now.getFullYear();
    // DAS competência = mês anterior
    let compMes = now.getMonth();
    let compAno = ano;
    if (compMes === 0) { compMes = 12; compAno--; }

    setLoading(true);
    Promise.all([
      api.get<TermometroData>("/financeiro/termometro").catch(() => null),
      api.get<DASStatusData>(`/financeiro/das/status/${compMes}/${compAno}`).catch(() => null),
      api.get<{ lancamentos: Lancamento[] }>(`/financeiro/lancamentos?mes=${mes}&ano=${ano}&limit=10&offset=0`).catch(() => null),
      api.get<ResumoMensal>(`/financeiro/lancamentos/resumo?mes=${mes}&ano=${ano}`).catch(() => null),
    ]).then(([t, d, l, r]) => {
      if (t) setTermometro(t);
      if (d) setDasStatus(d);
      if (l) setLancamentos(l.lancamentos);
      if (r) setResumo(r);
    }).finally(() => setLoading(false));
  }, [refreshKey]);

  async function markDasPago() {
    if (!dasStatus?.id) return;
    try {
      await api.put(`/financeiro/das/${dasStatus.id}`, {
        competencia_mes: dasStatus.competencia_mes,
        competencia_ano: dasStatus.competencia_ano,
        valor_cents: dasStatus.valor_cents,
        data_pagamento: new Date().toISOString().split("T")[0],
      });
      toast.success("DAS marcado como pago!");
      setRefreshKey((k) => k + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao marcar DAS");
    }
  }

  const faturamento = termometro?.total_receitas_cents ?? 0;
  const limite = termometro?.limite_cents ?? 8_100_000;
  const percentual = termometro ? termometro.percentual_usado : 0;

  const badgeVariant: "green" | "amber" | "orange" | "red" =
    percentual < 50 ? "green" :
    percentual < 75 ? "amber" :
    percentual < 90 ? "orange" : "red";

  const now = new Date();
  const mesAtualLabel = MESES[now.getMonth()];

  const saldo = resumo?.saldo_cents ?? 0;
  const receitas = resumo?.total_receitas_cents ?? 0;
  const despesas = resumo?.total_despesas_cents ?? 0;

  const dasBadgeVariant = dasStatus ? DAS_STATUS_BADGE[dasStatus.status] : "gray";
  const dasLabel = dasStatus ? DAS_STATUS_LABEL[dasStatus.status] : "—";
  const dasIsPago = dasStatus?.status === "pago";

  return (
    <>
      <Toaster position="top-center" />
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar
          activeRoute="/dashboard"
          onNavigate={navigate}
          userName={user?.name || user?.email || ""}
        />

        <main className="flex-1 md:ml-[52px] pb-16 md:pb-0">
          <div className="p-4 max-w-2xl mx-auto">
            <Topbar userName={user?.name || user?.email || ""} />

            <div className="grid grid-cols-1 gap-3 mt-4 md:grid-cols-2">

              {/* Termômetro card — col-span-2 */}
              <div className="md:col-span-2">
                {loading ? (
                  <div className="bg-white border border-gray-100 rounded-xl p-3.5 animate-pulse">
                    <div className="h-4 bg-gray-100 rounded w-32 mb-3" />
                    <div className="h-3 bg-gray-100 rounded-full w-full mb-2" />
                    <div className="h-3 bg-gray-100 rounded w-48" />
                  </div>
                ) : (
                  <Card>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-medium text-gray-700">Faturamento {now.getFullYear()}</span>
                      <Badge variant={badgeVariant}>{percentual.toFixed(1)}%</Badge>
                    </div>
                    <Termometro valor={faturamento} limite={limite} />
                    {termometro?.meses_ate_limite != null && (
                      <p className="text-xs text-gray-500 mt-3">
                        No ritmo atual, você atinge o limite em ~{termometro.meses_ate_limite} meses
                      </p>
                    )}
                    {termometro?.meses_ate_limite == null && faturamento === 0 && (
                      <p className="text-xs text-gray-500 mt-3">Nenhuma receita registrada ainda este ano</p>
                    )}
                  </Card>
                )}
              </div>

              {/* DAS card */}
              {loading ? (
                <div className="bg-white border border-gray-100 rounded-xl p-3.5 animate-pulse">
                  <div className="h-3 bg-gray-100 rounded w-24 mb-2" />
                  <div className="h-6 bg-gray-100 rounded w-20 mb-2" />
                  <div className="h-3 bg-gray-100 rounded w-16" />
                </div>
              ) : (
                <Card>
                  <p className="text-xs text-gray-500">
                    DAS — {dasStatus ? `${MESES[dasStatus.competencia_mes - 1]}/${dasStatus.competencia_ano}` : mesAtualLabel}
                  </p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">
                    {dasStatus?.valor_cents ? brl(dasStatus.valor_cents) : "—"}
                  </p>
                  <Badge variant={dasBadgeVariant} className="mt-2">{dasLabel}</Badge>
                  {!dasIsPago && dasStatus?.id && (
                    <Button variant="primary" size="lg" className="mt-3" onClick={markDasPago}>
                      Marcar como pago
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="md"
                    className="mt-2 w-full"
                    onClick={() => navigate("/financeiro")}
                  >
                    Ver histórico
                  </Button>
                </Card>
              )}

              {/* Saldo card */}
              {loading ? (
                <div className="bg-white border border-gray-100 rounded-xl p-3.5 animate-pulse">
                  <div className="h-3 bg-gray-100 rounded w-20 mb-2" />
                  <div className="h-6 bg-gray-100 rounded w-24 mb-2" />
                  <div className="h-3 bg-gray-100 rounded w-32" />
                </div>
              ) : (
                <Card>
                  <p className="text-xs text-gray-500">Saldo do mês</p>
                  <p className={`text-2xl font-bold mt-1 ${saldo >= 0 ? "text-success" : "text-danger"}`}>
                    {brl(saldo)}
                  </p>
                  <div className="flex gap-4 mt-3">
                    <div>
                      <p className="text-xs text-gray-400">Receitas</p>
                      <p className="text-sm font-medium text-success">{brl(receitas)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Despesas</p>
                      <p className="text-sm font-medium text-danger">{brl(despesas)}</p>
                    </div>
                  </div>
                </Card>
              )}

              {/* Lançamentos recentes — col-span-2 */}
              <div className="md:col-span-2">
                {loading ? (
                  <div className="bg-white border border-gray-100 rounded-xl p-3.5 animate-pulse space-y-3">
                    <div className="h-4 bg-gray-100 rounded w-32" />
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="flex gap-3 items-center">
                        <div className="w-2 h-2 rounded-full bg-gray-100" />
                        <div className="h-3 bg-gray-100 rounded flex-1" />
                        <div className="h-3 bg-gray-100 rounded w-12" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <Card>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-medium text-gray-700">Lançamentos recentes</span>
                      <Button variant="ghost" size="sm" onClick={() => navigate("/financeiro")}>
                        + Novo
                      </Button>
                    </div>
                    {lancamentos.slice(0, 5).map((l) => (
                      <div
                        key={l.id}
                        className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0"
                      >
                        <div
                          className={`w-2 h-2 rounded-full flex-shrink-0 ${
                            l.tipo === "receita" ? "bg-success" : "bg-danger"
                          }`}
                        />
                        <span className="flex-1 text-sm text-gray-700 truncate">
                          {l.descricao || l.categoria}
                        </span>
                        <span className="text-xs text-gray-400">{formatDate(l.data)}</span>
                        <span
                          className={`text-sm font-medium ${
                            l.tipo === "receita" ? "text-success" : "text-danger"
                          }`}
                        >
                          {l.tipo === "receita" ? "+" : "-"} {brl(l.valor_cents)}
                        </span>
                      </div>
                    ))}
                    {lancamentos.length === 0 && (
                      <p className="text-sm text-gray-400 text-center py-4">
                        Nenhum lançamento ainda. Registre sua primeira receita!
                      </p>
                    )}
                    {lancamentos.length > 0 && (
                      <p
                        className="text-xs text-brand text-center mt-3 cursor-pointer hover:underline"
                        onClick={() => navigate("/financeiro")}
                      >
                        Ver todos
                      </p>
                    )}
                  </Card>
                )}
              </div>

            </div>
          </div>
        </main>
      </div>
    </>
  );
}
