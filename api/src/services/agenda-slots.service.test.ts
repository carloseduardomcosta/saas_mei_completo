// Importa SOMENTE as funções puras — sem dependência de banco de dados.
// Isso permite rodar os testes fora do container Docker.
import { describe, it, expect } from "vitest";
import { calculateSlots, spToUtc, dayOfWeekSP } from "./agenda-slots.pure";

// Data futura segura para testes — 2099-06-15 é segunda-feira (dayOfWeek = 1)
const DATE = "2099-06-15";
// "Agora" fixado muito antes da data de teste para que minAdvanceHours não bloqueie nada
const PAST_NOW = new Date("2000-01-01T00:00:00Z");

// ── Helpers ────────────────────────────────────────────────────────────────

function busy(startTime: string, endTime: string) {
  return {
    starts_at: spToUtc(DATE, startTime).toISOString(),
    ends_at: spToUtc(DATE, endTime).toISOString(),
  };
}

// ── spToUtc ────────────────────────────────────────────────────────────────

describe("spToUtc", () => {
  it("converte horário SP para UTC subtraindo 3h", () => {
    const d = spToUtc("2026-06-15", "09:00");
    expect(d.toISOString()).toBe("2026-06-15T12:00:00.000Z");
  });

  it("meia-noite SP = 03:00 UTC", () => {
    const d = spToUtc("2026-06-15", "00:00");
    expect(d.toISOString()).toBe("2026-06-15T03:00:00.000Z");
  });
});

// ── dayOfWeekSP ────────────────────────────────────────────────────────────

describe("dayOfWeekSP", () => {
  it("2099-06-15 é segunda-feira (1)", () => {
    expect(dayOfWeekSP("2099-06-15")).toBe(1);
  });

  it("2099-06-14 é domingo (0)", () => {
    expect(dayOfWeekSP("2099-06-14")).toBe(0);
  });
});

// ── calculateSlots ────────────────────────────────────────────────────────

describe("calculateSlots — sem conflitos", () => {
  it("gera slots corretos para janela 09:00–12:00 com serviço de 60min", () => {
    const slots = calculateSlots(
      DATE, 60, { start_time: "09:00", end_time: "12:00" }, [], 0, PAST_NOW
    );
    expect(slots).toHaveLength(3);
    expect(slots.map((s) => s.label)).toEqual(["09:00", "10:00", "11:00"]);
  });

  it("gera slots para serviço de 30min — 4 slots em 2h", () => {
    const slots = calculateSlots(
      DATE, 30, { start_time: "09:00", end_time: "11:00" }, [], 0, PAST_NOW
    );
    expect(slots).toHaveLength(4);
    expect(slots.map((s) => s.label)).toEqual(["09:00", "09:30", "10:00", "10:30"]);
  });

  it("último slot termina exatamente no fim da janela", () => {
    const slots = calculateSlots(
      DATE, 60, { start_time: "17:00", end_time: "18:00" }, [], 0, PAST_NOW
    );
    expect(slots).toHaveLength(1);
    expect(slots[0].label).toBe("17:00");
  });

  it("starts_at é ISO UTC válido", () => {
    const slots = calculateSlots(
      DATE, 60, { start_time: "09:00", end_time: "10:00" }, [], 0, PAST_NOW
    );
    const d = new Date(slots[0].starts_at);
    expect(isNaN(d.getTime())).toBe(false);
    expect(slots[0].starts_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
  });
});

describe("calculateSlots — availability null ou sem espaço", () => {
  it("retorna vazio quando availability é null", () => {
    expect(calculateSlots(DATE, 60, null, [], 0, PAST_NOW)).toHaveLength(0);
  });

  it("retorna vazio quando janela menor que a duração do serviço", () => {
    const slots = calculateSlots(
      DATE, 60, { start_time: "09:00", end_time: "09:30" }, [], 0, PAST_NOW
    );
    expect(slots).toHaveLength(0);
  });
});

describe("calculateSlots — minAdvanceHours", () => {
  it("filtra slots dentro da antecedência mínima", () => {
    // "Agora" = 10:00 SP = 13:00 UTC. minAdvance = 2h → corta slots antes de 12:00 SP
    const now = spToUtc(DATE, "10:00");
    const slots = calculateSlots(
      DATE, 60,
      { start_time: "09:00", end_time: "18:00" },
      [], 2, now
    );
    const labels = slots.map((s) => s.label);
    expect(labels).not.toContain("09:00");
    expect(labels).not.toContain("10:00");
    expect(labels).not.toContain("11:00");
    expect(labels).toContain("12:00");
    expect(labels).toContain("17:00");
  });

  it("com minAdvance = 0 não filtra nenhum slot futuro", () => {
    const now = spToUtc(DATE, "08:00");
    const slots = calculateSlots(
      DATE, 60,
      { start_time: "09:00", end_time: "12:00" },
      [], 0, now
    );
    expect(slots).toHaveLength(3);
  });
});

describe("calculateSlots — conflitos com agendamentos existentes", () => {
  it("exclui slot com conflito exato", () => {
    const slots = calculateSlots(
      DATE, 60,
      { start_time: "09:00", end_time: "18:00" },
      [busy("10:00", "11:00")], 0, PAST_NOW
    );
    expect(slots.map((s) => s.label)).not.toContain("10:00");
    expect(slots.map((s) => s.label)).toContain("09:00");
    expect(slots.map((s) => s.label)).toContain("11:00");
  });

  it("conflito parcial (agendamento começa no meio do slot) bloqueia o slot", () => {
    // Slot 09:00–10:00, agendamento 09:30–10:30 → overlap → bloqueado
    // Slot 10:00–11:00 também faz overlap com 09:30–10:30 → bloqueado
    const slots = calculateSlots(
      DATE, 60,
      { start_time: "09:00", end_time: "12:00" },
      [busy("09:30", "10:30")], 0, PAST_NOW
    );
    const labels = slots.map((s) => s.label);
    expect(labels).not.toContain("09:00");
    expect(labels).not.toContain("10:00");
    expect(labels).toContain("11:00");
  });

  it("bloqueio de dia inteiro remove todos os slots", () => {
    const slots = calculateSlots(
      DATE, 60,
      { start_time: "09:00", end_time: "18:00" },
      [busy("00:00", "23:59")], 0, PAST_NOW
    );
    expect(slots).toHaveLength(0);
  });

  it("dois agendamentos separados deixam slots livres entre eles", () => {
    const slots = calculateSlots(
      DATE, 60,
      { start_time: "08:00", end_time: "18:00" },
      [busy("09:00", "10:00"), busy("12:00", "13:00")], 0, PAST_NOW
    );
    const labels = slots.map((s) => s.label);
    expect(labels).toContain("08:00");
    expect(labels).not.toContain("09:00");
    expect(labels).toContain("10:00");
    expect(labels).toContain("11:00");
    expect(labels).not.toContain("12:00");
    expect(labels).toContain("13:00");
  });

  it("agendamento adjacente (termina quando o slot começa) não bloqueia", () => {
    // Agendamento 08:00–09:00, slot 09:00–10:00 → sem overlap (start < end é estrito)
    const slots = calculateSlots(
      DATE, 60,
      { start_time: "09:00", end_time: "10:00" },
      [busy("08:00", "09:00")], 0, PAST_NOW
    );
    expect(slots).toHaveLength(1);
    expect(slots[0].label).toBe("09:00");
  });
});
