interface DASStatus {
  competencia_mes: number;
  competencia_ano: number;
  status: "pago" | "pendente" | "vencido" | "nao_registrado";
  data_vencimento: string;
  data_pagamento: string | null;
  valor_cents: number | null;
  dias_atraso: number;
  id?: string;
}

export interface DASCardProps {
  dasStatus: DASStatus | null;
  isLoading?: boolean;
  onPagar: (das: DASStatus) => void;
  onVerHistorico: () => void;
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
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function diasRestantes(dataVencimento: string): number {
  const hoje = new Date().toISOString().split("T")[0];
  const diff = new Date(dataVencimento + "T00:00:00Z").getTime() - new Date(hoje + "T00:00:00Z").getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}


export function DASCard({ dasStatus, isLoading = false, onPagar, onVerHistorico }: DASCardProps) {
  if (isLoading) {
    return (
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 animate-pulse">
        <div className="h-5 bg-gray-200 rounded w-48 mb-4" />
        <div className="h-4 bg-gray-200 rounded w-36 mb-2" />
        <div className="h-4 bg-gray-200 rounded w-44 mb-4" />
        <div className="h-9 bg-gray-200 rounded w-32" />
      </div>
    );
  }

  if (!dasStatus) {
    return (
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <h2 className="text-base font-semibold text-gray-900 mb-3">📄 DAS — Próximo Vencimento</h2>
        <p className="text-sm text-gray-500">Nenhuma informação disponível.</p>
      </div>
    );
  }

  const { competencia_mes, competencia_ano, status, data_vencimento, data_pagamento, valor_cents, dias_atraso, id } = dasStatus;
  const restamDias = status === "pendente" ? diasRestantes(data_vencimento) : 0;
  const urgente = status === "pendente" && restamDias <= 5;

  return (
    <div className={`bg-white rounded-xl p-6 shadow-sm border ${urgente ? "border-yellow-400" : status === "vencido" ? "border-red-300" : "border-gray-100"}`}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-900">📄 DAS — Próximo Vencimento</h2>
        <span
          className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${
            status === "pago"
              ? "bg-green-100 text-green-800"
              : status === "vencido"
                ? "bg-red-100 text-red-800"
                : urgente
                  ? "bg-yellow-100 text-yellow-800"
                  : status === "nao_registrado"
                    ? "bg-gray-100 text-gray-700"
                    : "bg-blue-100 text-blue-800"
          }`}
        >
          {status === "pago" && "🟢 Pago"}
          {status === "vencido" && `🔴 Vencido há ${dias_atraso} dia${dias_atraso !== 1 ? "s" : ""}`}
          {status === "pendente" && (urgente ? "🟡 Pendente — URGENTE" : `🟡 Pendente (${restamDias} dias)`)}
          {status === "nao_registrado" && "⚪ Não registrado"}
        </span>
      </div>

      <dl className="space-y-2 text-sm mb-4">
        <div className="flex justify-between">
          <dt className="text-gray-500">Competência:</dt>
          <dd className="font-medium">{MESES[competencia_mes - 1]}/{competencia_ano}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-gray-500">Vencimento:</dt>
          <dd className={`font-medium ${status === "vencido" ? "text-red-600" : urgente ? "text-yellow-700" : ""}`}>
            {fmtData(data_vencimento)}
          </dd>
        </div>
        {valor_cents && (
          <div className="flex justify-between">
            <dt className="text-gray-500">Valor:</dt>
            <dd className="font-medium">{brl(valor_cents)}</dd>
          </div>
        )}
        {data_pagamento && (
          <div className="flex justify-between">
            <dt className="text-gray-500">Pago em:</dt>
            <dd className="font-medium text-green-700">{fmtData(data_pagamento)}</dd>
          </div>
        )}
      </dl>

      <div className="flex gap-2 pt-3 border-t border-gray-100">
        {status !== "pago" && (
          <button
            onClick={() => onPagar(dasStatus)}
            className="flex-1 bg-blue-600 text-white text-sm font-medium py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
          >
            {id ? "Marcar como Pago" : "Registrar DAS"}
          </button>
        )}
        <button
          onClick={onVerHistorico}
          className="flex-1 bg-gray-100 text-gray-700 text-sm font-medium py-2 px-4 rounded-lg hover:bg-gray-200 transition-colors"
        >
          Ver histórico
        </button>
      </div>
    </div>
  );
}
