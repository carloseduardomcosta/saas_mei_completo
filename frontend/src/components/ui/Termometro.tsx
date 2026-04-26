import { useEffect, useState } from "react";

interface TermometroProps {
  valor: number;  // in cents
  limite: number; // in cents
}

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
function brl(cents: number): string {
  return BRL.format(cents / 100);
}

function getBarColor(pct: number): string {
  if (pct < 50) return "bg-success";
  if (pct < 75) return "bg-warning";
  if (pct < 90) return "bg-brand";
  return "bg-danger";
}

export function Termometro({ valor, limite }: TermometroProps) {
  const rawPct = limite > 0 ? (valor / limite) * 100 : 0;
  const percentual = Math.min(rawPct, 100);
  const restante = Math.max(limite - valor, 0);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setWidth(percentual), 80);
    return () => clearTimeout(timer);
  }, [percentual]);

  const barColor = getBarColor(percentual);

  return (
    <div>
      {/* Bar */}
      <div
        role="progressbar"
        aria-valuenow={Math.round(percentual)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${percentual.toFixed(1)}% do limite anual MEI utilizado`}
        className="w-full bg-gray-100 rounded-full h-3 overflow-hidden"
      >
        <div
          className={`h-3 rounded-full ${barColor}`}
          style={{ width: `${width}%`, transition: "width 0.8s ease" }}
        />
      </div>

      {/* Stats row */}
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-gray-500">Usado: <strong className="text-gray-800">{brl(valor)}</strong></span>
        <span className="text-xs font-semibold text-gray-700">{percentual.toFixed(1)}%</span>
        <span className="text-xs text-gray-500">Restam: <strong className="text-gray-800">{brl(restante)}</strong></span>
      </div>

      {/* Scale labels */}
      <div className="flex justify-between mt-1">
        <span className="text-[10px] text-gray-400">R$ 0</span>
        <span className="text-[10px] text-gray-400">50%</span>
        <span className="text-[10px] text-gray-400">{brl(limite)}</span>
      </div>
    </div>
  );
}
