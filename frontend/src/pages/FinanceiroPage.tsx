import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Termometro, type TermometroProps } from "../components/financeiro/Termometro";
import { DASCard } from "../components/financeiro/DASCard";
import { DASModal } from "../components/financeiro/DASModal";
import { LancamentosLista } from "../components/financeiro/LancamentosLista";
import { NovoLancamentoModal } from "../components/financeiro/NovoLancamentoModal";

// ── Tipos ────────────────────────────────────────────────────────────────────

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
  // DAS referente ao mês anterior (competência = mês passado)
  const now = new Date();
  let mes = now.getMonth(); // mês passado (0-indexed = mês atual - 1)
  let ano = now.getFullYear();
  if (mes === 0) { mes = 12; ano--; }
  return { mes, ano };
}

// ── Componente principal ─────────────────────────────────────────────────────

export default function FinanceiroPage() {
  const { mes: mesAtual, ano: anoAtual } = getMesAnoAtual();

  // Estado do Termômetro
  const [termometro, setTermometro] = useState<TermometroData | null>(null);
  const [termometroLoading, setTermometroLoading] = useState(true);

  // Estado do DAS
  const [dasStatus, setDasStatus] = useState<DASStatusData | null>(null);
  const [dasLoading, setDasLoading] = useState(true);

  // Navegação mês/ano dos lançamentos
  const [mesLanc, setMesLanc] = useState(mesAtual);
  const [anoLanc, setAnoLanc] = useState(anoAtual);

  // Modais
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

  // Chave de refresh para lista
  const [refreshKey, setRefreshKey] = useState(0);

  // Fetch inicial em paralelo
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
      // Erros individuais não param o outro — cada seção tem fallback
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
      <title>Financeiro — MEI Completo</title>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4 pb-24">
        <h1 className="text-xl font-bold text-gray-900">Financeiro</h1>

        {/* Pilar 1 — Termômetro */}
        {termometroProps ? (
          <Termometro {...termometroProps} isLoading={termometroLoading} />
        ) : (
          <Termometro
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

        {/* Pilar 2 — DAS */}
        <DASCard
          dasStatus={dasStatus}
          isLoading={dasLoading}
          onPagar={(das) => setDasModal(das)}
          onVerHistorico={() => {
            setMesLanc(dasStatus?.competencia_mes ?? mesAtual);
            setAnoLanc(dasStatus?.competencia_ano ?? anoAtual);
          }}
        />

        {/* Pilar 3 — Lançamentos */}
        <LancamentosLista
          mes={mesLanc}
          ano={anoLanc}
          onMesChange={(m, a) => { setMesLanc(m); setAnoLanc(a); }}
          onEditLancamento={(l) => setLancModal({ open: true, lancamento: l })}
          onNovoLancamento={() => setLancModal({ open: true })}
          refreshKey={refreshKey}
        />
      </div>

      {/* FAB — Floating Action Button */}
      <button
        onClick={() => setLancModal({ open: true })}
        className="fixed bottom-6 right-6 w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg flex items-center justify-center text-2xl hover:bg-blue-700 active:scale-95 transition-all z-40"
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
    </>
  );
}
