import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import { Termometro as FinTermometro, type TermometroProps } from "../components/financeiro/Termometro";
import { DASCard } from "../components/financeiro/DASCard";
import { DASModal } from "../components/financeiro/DASModal";
import { LancamentosLista } from "../components/financeiro/LancamentosLista";
import { NovoLancamentoModal } from "../components/financeiro/NovoLancamentoModal";
import { Sidebar } from "../components/ui/Sidebar";
import { Topbar } from "../components/ui/Topbar";
import { Toaster } from "react-hot-toast";

// ── Types ────────────────────────────────────────────────────────────────────

interface TermometroData {
  ano: number;
  total_receitas_cents: number;
  limite_cents: number;
  percentual_usado: number;
  valor_restante_cents: number;
  media_mensal_cents: number;
  meses_ate_limite: number | null;
  status: "verde" | "amarelo" | "laranja" | "vermelho";
}

interface DASStatusData {
  competencia_mes: number;
  competencia_ano: number;
  status: "pago" | "pendente" | "vencido" | "nao_registrado";
  data_vencimento: string;
  data_pagamento: string | null;
  valor_cents: number | null;
  dias_atraso: number;
  id?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getMesAnoAtual(): { mes: number; ano: number } {
  const now = new Date();
  return { mes: now.getMonth() + 1, ano: now.getFullYear() };
}

function getProximoMesCompetencia(): { mes: number; ano: number } {
  const now = new Date();
  let mes = now.getMonth();
  let ano = now.getFullYear();
  if (mes === 0) { mes = 12; ano--; }
  return { mes, ano };
}

// ── Componente principal ─────────────────────────────────────────────────────

export default function FinanceiroPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { mes: mesAtual, ano: anoAtual } = getMesAnoAtual();

  const [termometro, setTermometro] = useState<TermometroData | null>(null);
  const [termometroLoading, setTermometroLoading] = useState(true);

  const [dasStatus, setDasStatus] = useState<DASStatusData | null>(null);
  const [dasLoading, setDasLoading] = useState(true);

  const [mesLanc, setMesLanc] = useState(mesAtual);
  const [anoLanc, setAnoLanc] = useState(anoAtual);

  const [dasModal, setDasModal] = useState<DASStatusData | null>(null);
  const [lancModal, setLancModal] = useState<{
    open: boolean;
    lancamento?: {
      id?: string;
      data?: string;
      tipo?: "receita" | "despesa";
      categoria?: string;
      descricao?: string | null;
      valor_cents?: number;
      status?: "confirmado" | "pendente";
    } | null;
  }>({ open: false });

  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const { mes: compMes, ano: compAno } = getProximoMesCompetencia();

    setTermometroLoading(true);
    setDasLoading(true);

    Promise.all([
      api.get<TermometroData>("/financeiro/termometro"),
      api.get<DASStatusData>(`/financeiro/das/status/${compMes}/${compAno}`),
    ]).then(([t, d]) => {
      setTermometro(t);
      setDasStatus(d);
    }).catch(() => {
      // Errors handled individually — each section has a fallback
    }).finally(() => {
      setTermometroLoading(false);
      setDasLoading(false);
    });
  }, [refreshKey]);

  function handleDasSaved() {
    setDasModal(null);
    setRefreshKey((k) => k + 1);
  }

  function handleLancSaved() {
    setLancModal({ open: false });
    setRefreshKey((k) => k + 1);
  }

  const termometroProps: TermometroProps | null = termometro
    ? {
        percentualUsado: termometro.percentual_usado,
        totalCents: termometro.total_receitas_cents,
        limiteCents: termometro.limite_cents,
        valorRestanteCents: termometro.valor_restante_cents,
        mediaMensalCents: termometro.media_mensal_cents,
        mesesAteLimite: termometro.meses_ate_limite,
        status: termometro.status,
      }
    : null;

  return (
    <>
      <Toaster position="top-center" />
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar
          activeRoute="/financeiro"
          onNavigate={navigate}
          userName={user?.name || user?.email || ""}
        />

        <main className="flex-1 md:ml-[52px] pb-16 md:pb-0">
          <div className="p-4 max-w-2xl mx-auto space-y-4">
            <Topbar userName={user?.name || user?.email || ""} />

            <h1 className="text-lg font-bold text-gray-900">Financeiro</h1>

            {/* Termômetro */}
            {termometroProps ? (
              <FinTermometro {...termometroProps} isLoading={termometroLoading} />
            ) : (
              <FinTermometro
                percentualUsado={0}
                totalCents={0}
                limiteCents={8_100_000}
                valorRestanteCents={8_100_000}
                mediaMensalCents={0}
                mesesAteLimite={null}
                status="verde"
                isLoading={termometroLoading}
              />
            )}

            {/* DAS */}
            <DASCard
              dasStatus={dasStatus}
              isLoading={dasLoading}
              onPagar={(das) => setDasModal(das)}
              onVerHistorico={() => {
                setMesLanc(dasStatus?.competencia_mes ?? mesAtual);
                setAnoLanc(dasStatus?.competencia_ano ?? anoAtual);
              }}
            />

            {/* Lançamentos */}
            <LancamentosLista
              mes={mesLanc}
              ano={anoLanc}
              onMesChange={(m, a) => { setMesLanc(m); setAnoLanc(a); }}
              onEditLancamento={(l) => setLancModal({ open: true, lancamento: l })}
              onNovoLancamento={() => setLancModal({ open: true })}
              refreshKey={refreshKey}
            />
          </div>
        </main>

        {/* FAB */}
        <button
          onClick={() => setLancModal({ open: true })}
          className="fixed bottom-20 md:bottom-6 right-6 w-14 h-14 bg-brand text-white rounded-full shadow-lg flex items-center justify-center text-2xl hover:bg-brand-dark active:scale-95 transition-all z-40"
          aria-label="Novo lançamento"
        >
          +
        </button>

        {/* Modal DAS */}
        {dasModal && (
          <DASModal
            das={dasModal}
            onClose={() => setDasModal(null)}
            onSaved={handleDasSaved}
          />
        )}

        {/* Modal Lançamento */}
        {lancModal.open && (
          <NovoLancamentoModal
            lancamento={lancModal.lancamento}
            onClose={() => setLancModal({ open: false })}
            onSaved={handleLancSaved}
          />
        )}
      </div>
    </>
  );
}
