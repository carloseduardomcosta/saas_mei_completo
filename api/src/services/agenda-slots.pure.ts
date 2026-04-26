// Funções puras de cálculo de disponibilidade — zero dependências de I/O.
// Separadas propositalmente para permitir testes unitários sem banco de dados.
// Brazil aboliu o horário de verão em 2019 (Decreto 9.772) → UTC-3 permanente.

export interface TimeSlot {
  starts_at: string; // ISO 8601 UTC  ex: "2026-06-15T12:00:00.000Z"
  label: string;     // HH:MM em SP   ex: "09:00"
}

export interface AvailabilityWindow {
  start_time: string; // "HH:MM"
  end_time: string;   // "HH:MM"
}

export interface BusyRange {
  starts_at: string; // ISO (UTC ou com offset)
  ends_at: string;
}

/** Converte "YYYY-MM-DD" + "HH:MM" (horário SP) em Date UTC. */
export function spToUtc(date: string, time: string): Date {
  return new Date(`${date}T${time}:00-03:00`);
}

/** Retorna "YYYY-MM-DD" atual no fuso SP. */
export function todaySP(): string {
  const [dd, mm, yyyy] = new Date()
    .toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
    .split("/");
  return `${yyyy}-${mm}-${dd}`;
}

/** Dia da semana (0=Dom … 6=Sáb) para "YYYY-MM-DD" em SP. */
export function dayOfWeekSP(date: string): number {
  return new Date(`${date}T12:00:00-03:00`).getDay();
}

/**
 * Gera todos os slots candidatos e remove os que conflitam com
 * agendamentos existentes, bloqueios ou antecedência mínima.
 *
 * @param date            "YYYY-MM-DD" no fuso SP
 * @param durationMinutes duração do serviço em minutos
 * @param availability    janela de trabalho do dia, ou null se dia fechado
 * @param busy            agendamentos confirmados + bloqueios do dia (ISO strings)
 * @param minAdvanceHours antecedência mínima em horas
 * @param now             momento atual (injetável para testes)
 */
export function calculateSlots(
  date: string,
  durationMinutes: number,
  availability: AvailabilityWindow | null,
  busy: BusyRange[],
  minAdvanceHours: number,
  now: Date = new Date()
): TimeSlot[] {
  if (!availability) return [];

  const [startH, startM] = availability.start_time.split(":").map(Number);
  const [endH, endM] = availability.end_time.split(":").map(Number);
  const windowStartMins = startH * 60 + startM;
  const windowEndMins = endH * 60 + endM;

  if (windowEndMins - windowStartMins < durationMinutes) return [];

  const minAdvanceMs = minAdvanceHours * 60 * 60 * 1000;

  const busyRanges = busy.map((b) => ({
    start: new Date(b.starts_at),
    end: new Date(b.ends_at),
  }));

  const slots: TimeSlot[] = [];

  for (
    let t = windowStartMins;
    t + durationMinutes <= windowEndMins;
    t += durationMinutes
  ) {
    const hh = String(Math.floor(t / 60)).padStart(2, "0");
    const mm = String(t % 60).padStart(2, "0");
    const slotStart = spToUtc(date, `${hh}:${mm}`);
    const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60_000);

    if (slotStart.getTime() - now.getTime() < minAdvanceMs) continue;

    // Overlap: A.start < B.end && A.end > B.start
    const overlaps = busyRanges.some(
      (r) => slotStart < r.end && slotEnd > r.start
    );
    if (overlaps) continue;

    slots.push({ starts_at: slotStart.toISOString(), label: `${hh}:${mm}` });
  }

  return slots;
}
