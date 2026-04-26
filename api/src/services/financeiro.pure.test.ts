import { describe, it, expect } from "vitest";
import {
  calcularTermometro,
  termometroStatus,
  isCategoriaValida,
  CATEGORIAS_RECEITA,
  CATEGORIAS_DESPESA,
} from "./financeiro.pure";

const LIMITE = 8_100_000; // R$ 81.000,00

// ── termometroStatus ────────────────────────────────────────────────────────

describe("termometroStatus", () => {
  it("0% → verde", () => {
    expect(termometroStatus(0)).toBe("verde");
  });

  it("49.9% → verde", () => {
    expect(termometroStatus(49.9)).toBe("verde");
  });

  it("50% → amarelo", () => {
    expect(termometroStatus(50)).toBe("amarelo");
  });

  it("74.99% → amarelo", () => {
    expect(termometroStatus(74.99)).toBe("amarelo");
  });

  it("75% → laranja", () => {
    expect(termometroStatus(75)).toBe("laranja");
  });

  it("89.99% → laranja", () => {
    expect(termometroStatus(89.99)).toBe("laranja");
  });

  it("90% → vermelho", () => {
    expect(termometroStatus(90)).toBe("vermelho");
  });

  it("100% → vermelho", () => {
    expect(termometroStatus(100)).toBe("vermelho");
  });

  it("110% → vermelho", () => {
    expect(termometroStatus(110)).toBe("vermelho");
  });
});

// ── calcularTermometro ──────────────────────────────────────────────────────

describe("calcularTermometro — 0 receitas", () => {
  it("percentualUsado = 0, status = verde, mesesAteLimite = null", () => {
    const r = calcularTermometro({
      totalReceitasCents: 0,
      limiteCents: LIMITE,
      mesAtual: 6,
    });
    expect(r.percentualUsado).toBe(0);
    expect(r.status).toBe("verde");
    expect(r.mesesAteLimite).toBeNull();
    expect(r.valorRestanteCents).toBe(LIMITE);
    expect(r.mediaMensalCents).toBe(0);
  });
});

describe("calcularTermometro — 50% do limite", () => {
  it("exatamente 50%: status amarelo, percentual correto", () => {
    const total = LIMITE / 2; // 4.050.000
    const r = calcularTermometro({
      totalReceitasCents: total,
      limiteCents: LIMITE,
      mesAtual: 6,
    });
    expect(r.percentualUsado).toBe(50);
    expect(r.status).toBe("amarelo");
    expect(r.valorRestanteCents).toBe(LIMITE / 2);
    expect(r.mediaMensalCents).toBe(total / 6); // média mensal
    expect(r.mesesAteLimite).not.toBeNull();
    // valorRestante / mediaMensal = 4.050.000 / (4.050.000/6) = 6 meses
    expect(r.mesesAteLimite).toBe(6);
  });
});

describe("calcularTermometro — 100% do limite", () => {
  it("limite atingido: status vermelho, restante = 0", () => {
    const r = calcularTermometro({
      totalReceitasCents: LIMITE,
      limiteCents: LIMITE,
      mesAtual: 12,
    });
    expect(r.percentualUsado).toBe(100);
    expect(r.status).toBe("vermelho");
    expect(r.valorRestanteCents).toBe(0);
    expect(r.mesesAteLimite).toBe(0);
  });
});

describe("calcularTermometro — acima de 100%", () => {
  it("limite ultrapassado: percentual > 100, restante = 0, meses = 0", () => {
    const r = calcularTermometro({
      totalReceitasCents: LIMITE * 1.1,
      limiteCents: LIMITE,
      mesAtual: 10,
    });
    expect(r.percentualUsado).toBeGreaterThan(100);
    expect(r.status).toBe("vermelho");
    expect(r.valorRestanteCents).toBe(0); // nunca negativo
    expect(r.mesesAteLimite).toBe(0);
  });
});

describe("calcularTermometro — meses decorridos", () => {
  it("janeiro (mesAtual=1): meses decorridos = 1 (mínimo)", () => {
    const total = 1_000_000;
    const r = calcularTermometro({
      totalReceitasCents: total,
      limiteCents: LIMITE,
      mesAtual: 1,
    });
    expect(r.mediaMensalCents).toBe(1_000_000); // total / 1
  });

  it("dezembro (mesAtual=12): meses decorridos = 12", () => {
    const total = 6_000_000;
    const r = calcularTermometro({
      totalReceitasCents: total,
      limiteCents: LIMITE,
      mesAtual: 12,
    });
    expect(r.mediaMensalCents).toBe(500_000); // 6.000.000 / 12
  });

  it("mesAtual=0 usa mínimo de 1 mês", () => {
    const r = calcularTermometro({
      totalReceitasCents: 100_000,
      limiteCents: LIMITE,
      mesAtual: 0,
    });
    expect(r.mediaMensalCents).toBe(100_000);
  });
});

describe("calcularTermometro — percentual com 2 casas decimais", () => {
  it("1/3 do limite → 33.33%", () => {
    const r = calcularTermometro({
      totalReceitasCents: LIMITE / 3,
      limiteCents: LIMITE,
      mesAtual: 4,
    });
    expect(r.percentualUsado).toBe(33.33);
  });
});

// ── isCategoriaValida ───────────────────────────────────────────────────────

describe("isCategoriaValida", () => {
  it("categorias de receita são válidas para tipo=receita", () => {
    for (const cat of CATEGORIAS_RECEITA) {
      expect(isCategoriaValida("receita", cat)).toBe(true);
    }
  });

  it("categorias de despesa são válidas para tipo=despesa", () => {
    for (const cat of CATEGORIAS_DESPESA) {
      expect(isCategoriaValida("despesa", cat)).toBe(true);
    }
  });

  it("categoria de receita não é válida para despesa", () => {
    expect(isCategoriaValida("despesa", "venda_produto")).toBe(false);
  });

  it("categoria de despesa não é válida para receita", () => {
    expect(isCategoriaValida("receita", "aluguel")).toBe(false);
  });

  it("categoria inexistente → inválida", () => {
    expect(isCategoriaValida("receita", "inventada")).toBe(false);
    expect(isCategoriaValida("despesa", "inventada")).toBe(false);
  });
});
