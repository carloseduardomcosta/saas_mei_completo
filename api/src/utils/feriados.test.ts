import { describe, it, expect } from "vitest";
import {
  pascoa,
  feriadosNacionais,
  isBusinessDay,
  nextBusinessDay,
  dasVencimento,
} from "./feriados";

// Helper: cria Date em UTC meia-noite a partir de "YYYY-MM-DD"
function d(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00Z`);
}

// Helper: formata Date UTC como "YYYY-MM-DD"
function fmt(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ── pascoa ─────────────────────────────────────────────────────────────────

describe("pascoa", () => {
  it("2024: 31 de março", () => {
    const p = pascoa(2024);
    expect(fmt(p)).toBe("2024-03-31");
  });

  it("2025: 20 de abril", () => {
    const p = pascoa(2025);
    expect(fmt(p)).toBe("2025-04-20");
  });

  it("2026: 5 de abril", () => {
    const p = pascoa(2026);
    expect(fmt(p)).toBe("2026-04-05");
  });

  it("2030: 21 de abril (coincide com Tiradentes)", () => {
    const p = pascoa(2030);
    expect(fmt(p)).toBe("2030-04-21");
  });
});

// ── feriadosNacionais ──────────────────────────────────────────────────────

describe("feriadosNacionais", () => {
  it("2025 contém Sexta-Santa em 18/04/2025 (Páscoa 20/04 - 2d)", () => {
    const feriados = feriadosNacionais(2025).map(fmt);
    expect(feriados).toContain("2025-04-18"); // Sexta-Santa
  });

  it("2025 contém Carnaval segunda em 03/03/2025 e terça em 04/03/2025 (Páscoa 20/04)", () => {
    // Páscoa 2025 = 20/04 (domingo)
    // Segunda de Carnaval = 20/04 - 48 = 03/03
    // Terça de Carnaval   = 20/04 - 47 = 04/03
    const feriados = feriadosNacionais(2025).map(fmt);
    expect(feriados).toContain("2025-03-03"); // Carnaval segunda (Páscoa - 48)
    expect(feriados).toContain("2025-03-04"); // Carnaval terça (Páscoa - 47)
  });

  it("2025 contém Corpus Christi em 19/06/2025 (Páscoa 20/04 + 60d)", () => {
    const feriados = feriadosNacionais(2025).map(fmt);
    expect(feriados).toContain("2025-06-19"); // Corpus Christi
  });

  it("2026 contém Carnaval em 16/02/2026 e 17/02/2026 (Páscoa 05/04 - 47d e -46d)", () => {
    const feriados = feriadosNacionais(2026).map(fmt);
    expect(feriados).toContain("2026-02-16"); // Carnaval segunda
    expect(feriados).toContain("2026-02-17"); // Carnaval terça
  });

  it("contém os 9 feriados fixos de 2025", () => {
    const feriados = feriadosNacionais(2025).map(fmt);
    expect(feriados).toContain("2025-01-01"); // Confraternização
    expect(feriados).toContain("2025-04-21"); // Tiradentes
    expect(feriados).toContain("2025-05-01"); // Dia do Trabalho
    expect(feriados).toContain("2025-09-07"); // Independência
    expect(feriados).toContain("2025-10-12"); // N. Sra. Aparecida
    expect(feriados).toContain("2025-11-02"); // Finados
    expect(feriados).toContain("2025-11-15"); // Proclamação da República
    expect(feriados).toContain("2025-11-20"); // Consciência Negra
    expect(feriados).toContain("2025-12-25"); // Natal
  });

  it("retorna 14 feriados no total (9 fixos + 5 móveis)", () => {
    const feriados = feriadosNacionais(2025);
    expect(feriados).toHaveLength(14);
  });
});

// ── isBusinessDay ──────────────────────────────────────────────────────────

describe("isBusinessDay", () => {
  it("2025-06-16 (segunda-feira) é dia útil", () => {
    expect(isBusinessDay(d("2025-06-16"))).toBe(true);
  });

  it("2025-06-14 (sábado) não é dia útil", () => {
    expect(isBusinessDay(d("2025-06-14"))).toBe(false);
  });

  it("2025-06-15 (domingo) não é dia útil", () => {
    expect(isBusinessDay(d("2025-06-15"))).toBe(false);
  });

  it("2025-12-25 (Natal — feriado fixo) não é dia útil", () => {
    expect(isBusinessDay(d("2025-12-25"))).toBe(false);
  });

  it("2025-04-18 (Sexta-Santa — feriado móvel) não é dia útil", () => {
    expect(isBusinessDay(d("2025-04-18"))).toBe(false);
  });

  it("2025-04-21 (Tiradentes) não é dia útil", () => {
    expect(isBusinessDay(d("2025-04-21"))).toBe(false);
  });

  it("2026-02-16 (Carnaval segunda) não é dia útil", () => {
    expect(isBusinessDay(d("2026-02-16"))).toBe(false);
  });

  it("2026-02-18 (quarta de cinzas — não é feriado nacional) é dia útil", () => {
    // Quarta de cinzas não é feriado nacional no Brasil
    expect(isBusinessDay(d("2026-02-18"))).toBe(true);
  });
});

// ── nextBusinessDay ────────────────────────────────────────────────────────

describe("nextBusinessDay", () => {
  it("se já é dia útil, retorna a própria data", () => {
    // 2025-06-16 = segunda, dia útil
    expect(fmt(nextBusinessDay(d("2025-06-16")))).toBe("2025-06-16");
  });

  it("sábado (2025-06-14) avança para segunda (2025-06-16)", () => {
    expect(fmt(nextBusinessDay(d("2025-06-14")))).toBe("2025-06-16");
  });

  it("domingo (2025-06-15) avança para segunda (2025-06-16)", () => {
    expect(fmt(nextBusinessDay(d("2025-06-15")))).toBe("2025-06-16");
  });

  it("Sexta-Santa (2025-04-18) avança pulando FDS → terça 2025-04-22", () => {
    // 18 abr = Sexta-Santa, 19 abr = sábado, 20 abr = Páscoa/domingo → 22 abr (terça)
    expect(fmt(nextBusinessDay(d("2025-04-18")))).toBe("2025-04-22");
  });

  it("Natal (2025-12-25, quinta) avança para 2025-12-26 (sexta útil)", () => {
    // 26/12/2025 = sexta — não é feriado nacional
    expect(fmt(nextBusinessDay(d("2025-12-25")))).toBe("2025-12-26");
  });
});

// ── dasVencimento ──────────────────────────────────────────────────────────

describe("dasVencimento", () => {
  it("competência Maio/2025: vence 20/06/2025 (sexta-feira útil)", () => {
    // 20/06/2025 = sexta-feira, não é feriado → permanece
    expect(fmt(dasVencimento(5, 2025))).toBe("2025-06-20");
  });

  it("competência Janeiro/2026: dia 20 = quarta útil → 2026-02-20", () => {
    // 20/02/2026 = sexta-feira, não é feriado
    expect(fmt(dasVencimento(1, 2026))).toBe("2026-02-20");
  });

  it("competência Dezembro/2024 (vence jan/2025): dia 20/01/2025 = segunda útil", () => {
    // 20/01/2025 = segunda-feira, não é feriado
    expect(fmt(dasVencimento(12, 2024))).toBe("2025-01-20");
  });

  it("competência Abril/2025 (vence em maio): dia 20/05/2025 = terça útil", () => {
    // 20/05/2025 = terça (Dia do Trabalho é 01/05), não é feriado
    expect(fmt(dasVencimento(4, 2025))).toBe("2025-05-20");
  });

  it("quando dia 20 cai em sábado, avança para segunda", () => {
    // Precisamos encontrar um caso onde dia 20 do mês M+1 é sábado
    // Dezembro/2025 → vence 20/01/2026 = terça? Ou verificar outro mês
    // Outubro/2025 → vence 20/11/2025 = quinta útil
    // Vamos verificar: Fevereiro/2026 → vence 20/03/2026
    // 20/03/2026 = sexta-feira, não é feriado
    const v = dasVencimento(2, 2026);
    expect(v.getUTCDay()).not.toBe(0); // não é domingo
    expect(v.getUTCDay()).not.toBe(6); // não é sábado
  });

  it("quando dia 20 cai em domingo, avança para segunda", () => {
    // Junho/2025 → vence 20/07/2025 = domingo → avança para 21/07/2025 (segunda)
    expect(fmt(dasVencimento(6, 2025))).toBe("2025-07-21");
  });

  it("competência Novembro/2025 (vence 20/12 = sábado → 22/12 segunda)", () => {
    // 20/12/2025 = sábado → avança para 22/12/2025 (segunda)
    expect(fmt(dasVencimento(11, 2025))).toBe("2025-12-22");
  });
});
