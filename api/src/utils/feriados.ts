/**
 * Lógica de feriados brasileiros e cálculo de dias úteis.
 * Zero dependências externas — funciona para anos 2024–2035+.
 *
 * Feriados nacionais fixos (9):
 *   01-01 Confraternização Universal
 *   04-21 Tiradentes
 *   05-01 Dia do Trabalho
 *   09-07 Independência do Brasil
 *   10-12 Nossa Senhora Aparecida
 *   11-02 Finados
 *   11-15 Proclamação da República
 *   11-20 Consciência Negra (lei federal desde 2024)
 *   12-25 Natal
 *
 * Feriados móveis (5, derivados da Páscoa):
 *   Carnaval 2ª-feira (Páscoa - 47d)
 *   Carnaval 3ª-feira (Páscoa - 46d)
 *   Sexta-feira Santa (Páscoa - 2d)
 *   Páscoa (domingo)
 *   Corpus Christi (Páscoa + 60d)
 */

// Formato "MM-DD"
const FERIADOS_FIXOS = [
  "01-01", // Confraternização Universal
  "04-21", // Tiradentes
  "05-01", // Dia do Trabalho
  "09-07", // Independência do Brasil
  "10-12", // Nossa Senhora Aparecida
  "11-02", // Finados
  "11-15", // Proclamação da República
  "11-20", // Consciência Negra
  "12-25", // Natal
];

/** Adiciona N dias a uma Date, retornando nova Date (sem mutar a original). */
function addDays(date: Date, days: number): Date {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/**
 * Calcula a data da Páscoa para um dado ano.
 * Algoritmo: Butcher/Meeus (sem dependências externas).
 * Retorna Date em UTC meia-noite.
 */
export function pascoa(ano: number): Date {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31); // 1-indexed
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  // Date.UTC para garantir meia-noite UTC (sem surpresas de DST)
  return new Date(Date.UTC(ano, mes - 1, dia));
}

/**
 * Retorna todos os feriados nacionais (fixos + móveis) de um ano.
 * Resultado como array de Dates em UTC meia-noite.
 */
export function feriadosNacionais(ano: number): Date[] {
  const fixos = FERIADOS_FIXOS.map((mmdd) => {
    const [mm, dd] = mmdd.split("-").map(Number);
    return new Date(Date.UTC(ano, mm - 1, dd));
  });

  const p = pascoa(ano);
  const moveis = [
    addDays(p, -48), // Carnaval segunda-feira
    addDays(p, -47), // Carnaval terça-feira (Mardi Gras)
    addDays(p, -2),  // Sexta-feira Santa
    p,               // Páscoa
    addDays(p, 60),  // Corpus Christi
  ];

  return [...fixos, ...moveis];
}

/** Formata uma Date em UTC como "YYYY-MM-DD". */
function toUtcDateString(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Verifica se uma data é dia útil (não é FDS nem feriado nacional).
 * A data deve ser interpretada como UTC (use Date.UTC ou new Date(`YYYY-MM-DDT00:00:00Z`)).
 */
export function isBusinessDay(date: Date): boolean {
  const dow = date.getUTCDay(); // 0 = domingo, 6 = sábado
  if (dow === 0 || dow === 6) return false;

  const ano = date.getUTCFullYear();
  const dateStr = toUtcDateString(date);
  const feriados = feriadosNacionais(ano);
  return !feriados.some((f) => toUtcDateString(f) === dateStr);
}

/**
 * Retorna o próximo dia útil a partir de `date`.
 * Se `date` já for dia útil, retorna a própria data.
 */
export function nextBusinessDay(date: Date): Date {
  let d = new Date(date.getTime());
  while (!isBusinessDay(d)) {
    d = addDays(d, 1);
  }
  return d;
}

/**
 * Calcula a data real de vencimento do DAS para uma competência.
 *
 * Regra: DAS vence no dia 20 do mês M+1.
 * Se o dia 20 não for dia útil, avança para o próximo dia útil.
 *
 * @param mes  mês de competência (1–12)
 * @param ano  ano de competência (ex: 2025)
 * @returns    Date em UTC representando a data de vencimento
 */
export function dasVencimento(mes: number, ano: number): Date {
  // Dia 20 do mês seguinte à competência
  let mesVenc = mes + 1;
  let anoVenc = ano;
  if (mesVenc > 12) {
    mesVenc = 1;
    anoVenc += 1;
  }
  const dia20 = new Date(Date.UTC(anoVenc, mesVenc - 1, 20));
  return nextBusinessDay(dia20);
}
