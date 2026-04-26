/**
 * Jobs diários do módulo financeiro.
 * Job A: alertas de DAS (aviso de vencimento + DAS vencido)
 * Job B: alertas do termômetro (marcos 50%, 75%, 90%, 100%)
 *
 * Idempotência garantida via tabela financeiro.alertas_enviados (UNIQUE).
 */

import { db } from "../db";
import { logger } from "../utils/logger";
import { dasVencimento } from "../utils/feriados";
import { calcularTermometro } from "../services/financeiro.pure";
import { sendDasAvisoVencimento, sendDasVencido, sendTermometroAlerta } from "../emails/financeiro-emails";

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function todaySP(): string {
  return new Date()
    .toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
    .split("/")
    .reverse()
    .join("-");
}

/** Verifica se um alerta já foi enviado (idempotência). */
async function alertaJaEnviado(
  meiId: string,
  tipoAlerta: string,
  periodoRef: string
): Promise<boolean> {
  const { rows } = await db.query(
    `SELECT 1 FROM financeiro.alertas_enviados
     WHERE mei_id = $1 AND tipo_alerta = $2 AND periodo_ref = $3`,
    [meiId, tipoAlerta, periodoRef]
  );
  return rows.length > 0;
}

/** Registra alerta como enviado. */
async function registrarAlerta(
  meiId: string,
  tipoAlerta: string,
  periodoRef: string
): Promise<void> {
  await db.query(
    `INSERT INTO financeiro.alertas_enviados (mei_id, tipo_alerta, periodo_ref)
     VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING`,
    [meiId, tipoAlerta, periodoRef]
  );
}

// ── Job A: Alertas de DAS ──────────────────────────────────────────────────

export async function runDasAlertasJob(): Promise<number> {
  const hoje = todaySP();
  const now = new Date(hoje + "T00:00:00Z");
  const anoAtual = now.getUTCFullYear();
  const mesAtual = now.getUTCMonth() + 1; // 1–12

  let alertasEnviados = 0;

  // Busca todos os MEIs ativos com email
  const { rows: meis } = await db.query<{ id: string; email: string; name: string }>(
    `SELECT id, email, name FROM public.users ORDER BY created_at`
  );

  // Para cada MEI, verifica competências: mês atual + 2 meses anteriores
  for (const mei of meis) {
    const competencias: Array<{ mes: number; ano: number }> = [];
    for (let delta = -2; delta <= 0; delta++) {
      let m = mesAtual + delta;
      let a = anoAtual;
      if (m < 1) {
        m += 12;
        a -= 1;
      }
      competencias.push({ mes: m, ano: a });
    }

    for (const { mes, ano } of competencias) {
      try {
        const vencimento = dasVencimento(mes, ano);
        const vencimentoStr = fmtDate(vencimento);
        const periodoRef = `${ano}-${String(mes).padStart(2, "0")}`;

        // Busca DAS registrado
        const { rows: dasRows } = await db.query<{
          valor_cents: number;
          data_pagamento: string | null;
        }>(
          `SELECT valor_cents, data_pagamento
           FROM financeiro.das_pagamentos
           WHERE mei_id = $1 AND competencia_mes = $2 AND competencia_ano = $3`,
          [mei.id, mes, ano]
        );

        const das = dasRows[0];

        // Se pago, skip
        if (das?.data_pagamento) continue;

        // Calcula dias até o vencimento (positivo = antes, negativo = depois)
        const hojeDate = new Date(hoje + "T00:00:00Z");
        const diffMs = vencimento.getTime() - hojeDate.getTime();
        const diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        // Aviso de vencimento: quando restam <= 5 dias e ainda não venceu
        if (diffDias >= 0 && diffDias <= 5) {
          const tipoAlerta = "das_aviso_vencimento";
          if (!(await alertaJaEnviado(mei.id, tipoAlerta, periodoRef))) {
            sendDasAvisoVencimento({
              meiEmail: mei.email,
              meiNome: mei.name,
              meiId: mei.id,
              competenciaMes: mes,
              competenciaAno: ano,
              dataVencimento: vencimentoStr,
              valorCents: das?.valor_cents ?? null,
            }).catch(() => {}); // fire-and-forget

            await registrarAlerta(mei.id, tipoAlerta, periodoRef);
            alertasEnviados++;
            logger.info("financeiro.cron.das_aviso.sent", {
              meiId: mei.id,
              periodoRef,
              diffDias,
            });
          }
        }

        // DAS vencido: passou da data de vencimento sem pagamento
        if (hoje > vencimentoStr) {
          const tipoAlerta = "das_vencido";
          if (!(await alertaJaEnviado(mei.id, tipoAlerta, periodoRef))) {
            const diasAtraso = Math.floor(
              (hojeDate.getTime() - vencimento.getTime()) / (1000 * 60 * 60 * 24)
            );

            sendDasVencido({
              meiEmail: mei.email,
              meiNome: mei.name,
              meiId: mei.id,
              competenciaMes: mes,
              competenciaAno: ano,
              dataVencimento: vencimentoStr,
              diasAtraso,
              valorCents: das?.valor_cents ?? null,
            }).catch(() => {}); // fire-and-forget

            await registrarAlerta(mei.id, tipoAlerta, periodoRef);
            alertasEnviados++;
            logger.info("financeiro.cron.das_vencido.sent", {
              meiId: mei.id,
              periodoRef,
              diasAtraso,
            });
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error("financeiro.cron.das_alerta.failed", {
          meiId: mei.id,
          competencia: `${mes}/${ano}`,
          error: msg,
        });
      }
    }
  }

  return alertasEnviados;
}

// ── Job B: Alertas do Termômetro ───────────────────────────────────────────

export async function runTermometroAlertasJob(): Promise<number> {
  const anoAtual = new Date().getFullYear();
  const mesAtual = new Date().getMonth() + 1;
  let alertasEnviados = 0;

  const { rows: meis } = await db.query<{ id: string; email: string; name: string }>(
    `SELECT id, email, name FROM public.users ORDER BY created_at`
  );

  for (const mei of meis) {
    try {
      // Total de receitas confirmadas no ano
      const { rows: totaisRows } = await db.query<{ total: string }>(
        `SELECT COALESCE(SUM(valor_cents), 0) AS total
         FROM financeiro.lancamentos
         WHERE mei_id = $1
           AND tipo = 'receita'
           AND status = 'confirmado'
           AND deleted_at IS NULL
           AND EXTRACT(YEAR FROM data) = $2`,
        [mei.id, anoAtual]
      );

      const totalReceitasCents = Number(totaisRows[0]?.total ?? 0);

      // Limite do MEI
      const { rows: configRows } = await db.query<{ limite_anual_cents: number }>(
        `SELECT COALESCE(
           (SELECT limite_anual_cents FROM financeiro.config WHERE mei_id = $1),
           (SELECT valor::INTEGER FROM financeiro.parametros_globais WHERE chave = 'limite_anual_mei_cents'),
           8100000
         ) AS limite_anual_cents`,
        [mei.id]
      );

      const limiteCents = configRows[0]?.limite_anual_cents ?? 8_100_000;

      const resultado = calcularTermometro({
        totalReceitasCents,
        limiteCents,
        mesAtual,
      });

      const periodoRef = String(anoAtual);
      const MARCOS = [50, 75, 90, 100] as const;

      for (const marco of MARCOS) {
        if (resultado.percentualUsado >= marco) {
          const tipoAlerta = `termometro_${marco}pct`;
          if (!(await alertaJaEnviado(mei.id, tipoAlerta, periodoRef))) {
            sendTermometroAlerta({
              meiEmail: mei.email,
              meiNome: mei.name,
              meiId: mei.id,
              ano: anoAtual,
              marco,
              percentualAtual: resultado.percentualUsado,
              totalCents: totalReceitasCents,
              limiteCents,
              mesesAteLimite: resultado.mesesAteLimite,
            }).catch(() => {}); // fire-and-forget

            await registrarAlerta(mei.id, tipoAlerta, periodoRef);
            alertasEnviados++;
            logger.info("financeiro.cron.termometro.sent", {
              meiId: mei.id,
              marco,
              percentual: resultado.percentualUsado,
            });
          }
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("financeiro.cron.termometro_alerta.failed", {
        meiId: mei.id,
        error: msg,
      });
    }
  }

  return alertasEnviados;
}

// ── Entry point do job diário ──────────────────────────────────────────────

export async function runFinanceiroDailyJobs(): Promise<void> {
  logger.info("financeiro.cron.start");
  const startMs = Date.now();

  try {
    const [dasAlertas, termometroAlertas] = await Promise.all([
      runDasAlertasJob(),
      runTermometroAlertasJob(),
    ]);

    logger.info("financeiro.cron.done", {
      durationMs: Date.now() - startMs,
      dasAlertasEnviados: dasAlertas,
      termometroAlertasEnviados: termometroAlertas,
      totalAlertas: dasAlertas + termometroAlertas,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("financeiro.cron.fatal", {
      error: msg,
      durationMs: Date.now() - startMs,
    });
  }
}
