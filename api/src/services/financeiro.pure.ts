/**
 * Funções puras do módulo financeiro — zero I/O, testáveis sem container.
 * Padrão pure/IO separation herdado do módulo de agenda.
 */

// ── Categorias válidas ────────────────────────────────────────────────────

export const CATEGORIAS_RECEITA = [
  "venda_produto",
  "prestacao_servico",
  "outros_receita",
] as const;

export const CATEGORIAS_DESPESA = [
  "aluguel",
  "material",
  "transporte",
  "alimentacao",
  "marketing",
  "das",
  "outros_despesa",
] as const;

export type CategoriaReceita = (typeof CATEGORIAS_RECEITA)[number];
export type CategoriaDespesa = (typeof CATEGORIAS_DESPESA)[number];

export function isCategoriaReceita(v: string): v is CategoriaReceita {
  return (CATEGORIAS_RECEITA as readonly string[]).includes(v);
}

export function isCategoriaDespesa(v: string): v is CategoriaDespesa {
  return (CATEGORIAS_DESPESA as readonly string[]).includes(v);
}

export function isCategoriaValida(tipo: "receita" | "despesa", categoria: string): boolean {
  if (tipo === "receita") return isCategoriaReceita(categoria);
  return isCategoriaDespesa(categoria);
}

// ── Termômetro ─────────────────────────────────────────────────────────────

export interface TermometroInput {
  totalReceitasCents: number;
  limiteCents: number;
  /** Mês atual do ano (1–12) — usado para calcular meses decorridos */
  mesAtual: number;
}

export interface TermometroResult {
  percentualUsado: number;         // 2 casas decimais
  valorRestanteCents: number;
  mediaMensalCents: number;
  mesesAteLimite: number | null;   // null se media = 0
  status: "verde" | "amarelo" | "laranja" | "vermelho";
}

/**
 * Calcula o status do termômetro do limite anual MEI.
 *
 * Regras:
 * - meses decorridos = mesAtual (mínimo 1)
 * - media mensal = totalReceitas / meses decorridos
 * - meses até limite = valorRestante / media (null se media = 0)
 * - status: verde <50%, amarelo 50-74%, laranja 75-89%, vermelho >=90%
 */
export function calcularTermometro(input: TermometroInput): TermometroResult {
  const { totalReceitasCents, limiteCents, mesAtual } = input;

  const mesesDecorridos = Math.max(1, mesAtual);
  const percentualUsado = Number(((totalReceitasCents / limiteCents) * 100).toFixed(2));
  const valorRestanteCents = Math.max(0, limiteCents - totalReceitasCents);
  const mediaMensalCents = Math.round(totalReceitasCents / mesesDecorridos);

  let mesesAteLimite: number | null = null;
  if (mediaMensalCents > 0) {
    mesesAteLimite = Number((valorRestanteCents / mediaMensalCents).toFixed(1));
    if (mesesAteLimite < 0) mesesAteLimite = 0;
  }

  const status = termometroStatus(percentualUsado);

  return {
    percentualUsado,
    valorRestanteCents,
    mediaMensalCents,
    mesesAteLimite,
    status,
  };
}

/**
 * Retorna o status semântico do termômetro com base no percentual.
 *
 * verde:    0 – 49.99%
 * amarelo: 50 – 74.99%
 * laranja: 75 – 89.99%
 * vermelho: >= 90%
 */
export function termometroStatus(
  percentual: number
): TermometroResult["status"] {
  if (percentual < 50) return "verde";
  if (percentual < 75) return "amarelo";
  if (percentual < 90) return "laranja";
  return "vermelho";
}
