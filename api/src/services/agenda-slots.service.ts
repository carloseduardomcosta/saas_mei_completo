// Camada de I/O do módulo de agenda — busca dados do banco e delega o cálculo
// para agenda-slots.pure.ts (funções puras, sem dependências de I/O).

import { query, queryOne } from "../db";
import {
  calculateSlots,
  spToUtc,
  todaySP,
  dayOfWeekSP,
  type TimeSlot,
  type AvailabilityWindow,
  type BusyRange,
} from "./agenda-slots.pure";

// Re-exporta tudo que as rotas precisam consumir
export { calculateSlots, spToUtc, todaySP, dayOfWeekSP };
export type { TimeSlot, AvailabilityWindow, BusyRange };

// ── Parâmetros para getAvailableSlots ─────────────────────────────────────

export interface GetSlotsParams {
  meiId: string;
  durationMinutes: number;
  date: string;             // "YYYY-MM-DD" em horário SP
  bookingAdvanceDays: number;
  minAdvanceHours: number;
}

// ── Função principal (com I/O) ─────────────────────────────────────────────

/**
 * Busca disponibilidade do MEI no banco e retorna slots livres para a data.
 * Retorna [] em qualquer caso de inelegibilidade (data passada, fora do limite, dia fechado).
 */
export async function getAvailableSlots(
  params: GetSlotsParams
): Promise<TimeSlot[]> {
  const { meiId, durationMinutes, date, bookingAdvanceDays, minAdvanceHours } =
    params;

  // ── 1. Validar faixa de datas ──────────────────────────────────────────
  const today = todaySP();
  if (date < today) return [];

  const maxDate = new Date(`${today}T00:00:00-03:00`);
  maxDate.setDate(maxDate.getDate() + bookingAdvanceDays);
  const maxDateStr = maxDate.toISOString().slice(0, 10);
  if (date > maxDateStr) return [];

  // ── 2. Disponibilidade semanal para o dia ──────────────────────────────
  const dow = dayOfWeekSP(date);

  const avail = await queryOne<AvailabilityWindow>(
    `SELECT TO_CHAR(start_time, 'HH24:MI') AS start_time,
            TO_CHAR(end_time,   'HH24:MI') AS end_time
     FROM agenda.weekly_availability
     WHERE mei_id = $1 AND day_of_week = $2`,
    [meiId, dow]
  );

  if (!avail) return [];

  // ── 3. Buscar períodos ocupados do dia ─────────────────────────────────
  // Janela SP do dia inteiro — evita perder agendamentos que cruzam meia-noite UTC
  const dayStart = spToUtc(date, "00:00");
  const dayEnd = spToUtc(date, "23:59");

  const bookings = await query<BusyRange>(
    `SELECT starts_at::text, ends_at::text
     FROM agenda.bookings
     WHERE mei_id = $1
       AND status != 'cancelled'
       AND starts_at < $3
       AND ends_at   > $2`,
    [meiId, dayStart.toISOString(), dayEnd.toISOString()]
  );

  const blocks = await query<BusyRange>(
    `SELECT starts_at::text, ends_at::text
     FROM agenda.time_blocks
     WHERE mei_id = $1
       AND starts_at < $3
       AND ends_at   > $2`,
    [meiId, dayStart.toISOString(), dayEnd.toISOString()]
  );

  // ── 4. Calcular slots ──────────────────────────────────────────────────
  return calculateSlots(
    date,
    durationMinutes,
    avail,
    [...bookings, ...blocks],
    minAdvanceHours
  );
}
