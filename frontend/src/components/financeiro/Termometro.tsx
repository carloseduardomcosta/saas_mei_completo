import { useEffect, useRef, useState } from "react";

export interface TermometroProps {
  percentualUsado: number;
  totalCents: number;
  limiteCents: number;
  valorRestanteCents: number;
  mediaMensalCents: number;
  mesesAteLimite: number | null;
  status: "verde" | "amarelo" | "laranja" | "vermelho";
  isLoading?: boolean;
}

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function brl(cents: number): string {
  return BRL.format(cents / 100);
}

const STATUS_COLORS = {
  verde:    { bar: "bg-green-500",  badge: "bg-green-100 text-green-800",  label: "Seguro" },
  amarelo:  { bar: "bg-yellow-500", badge: "bg-yellow-100 text-yellow-800", label: "Atenção" },
  laranja:  { bar: "bg-orange-500", badge: "bg-orange-100 text-orange-800", label: "Alerta" },
  vermelho: { bar: "bg-red-600",    badge: "bg-red-100 text-red-800",      label: "Crítico" },
} as const;

export function Termometro({
  percentualUsado,
  totalCents,
  limiteCents,
  valorRestanteCents,
  mediaMensalCents,
  mesesAteLimite,
  status,
  isLoading = false,
}: TermometroProps) {
  const [width, setWidth] = useState(0);
  const mounted = useRef(false);

  // Animação da barra ao montar
  useEffect(() => {
    if (!isLoading && !mounted.current) {
      mounted.current = true;
      const timer = setTimeout(() => {
        setWidth(Math.min(percentualUsado, 100));
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isLoading, percentualUsado]);

  const cfg = STATUS_COLORS[status];

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 animate-pulse">
        <div className="h-5 bg-gray-200 rounded w-48 mb-4" />
        <div className="h-3 bg-gray-200 rounded-full w-full mb-3" />
        <div className="h-4 bg-gray-200 rounded w-32 mb-2" />
        <div className="h-4 bg-gray-200 rounded w-48" />
      </div>
    );
  }

  const projecaoText =
    percentualUsado >= 100
      ? "⚠️ Limite ultrapassado!"
      : mesesAteLimite === null
        ? "Sem receitas registradas"
        : `Você atingirá o limite em ~${mesesAteLimite} meses`;

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-900">💰 Limite Anual MEI</h2>
        <span className={`text-xs font-medium px-2 py-1 rounded-full ${cfg.badge}`}>
          {cfg.label}
        </span>
      </div>

      {/* Valores */}
      <div className="mb-3">
        <span className="text-2xl font-bold text-gray-900">{brl(totalCents)}</span>
        <span className="text-gray-400 text-sm ml-1">de {brl(limiteCents)}</span>
      </div>

      {/* Barra de progresso */}
      <div
        role="progressbar"
        aria-valuenow={percentualUsado}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${percentualUsado.toFixed(1)}% do limite anual MEI utilizado`}
        className="w-full bg-gray-200 rounded-full h-3 mb-3 overflow-hidden"
      >
        <div
          className={`h-3 rounded-full transition-all duration-700 ease-out ${cfg.bar}`}
          style={{ width: `${width}%` }}
        />
      </div>

      {/* Percentual */}
      <div className="flex items-center justify-between text-sm mb-4">
        <span className={`font-semibold ${cfg.badge.split(" ")[1]}`}>
          {percentualUsado.toFixed(2)}% utilizado
        </span>
        <span className="text-gray-500">Restam {brl(valorRestanteCents)}</span>
      </div>

      {/* Projeção e média */}
      <div className="pt-3 border-t border-gray-100 space-y-1">
        <p className="text-xs text-gray-500">{projecaoText}</p>
        {mediaMensalCents > 0 && (
          <p className="text-xs text-gray-400">
            Média mensal: {brl(mediaMensalCents)}/mês
          </p>
        )}
      </div>
    </div>
  );
}
