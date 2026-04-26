/**
 * Configura o cron job diário do módulo financeiro.
 * Executa às 08h00 America/Sao_Paulo = 11h00 UTC (Brazil aboliu DST em 2019).
 *
 * Chamar initFinanceiroJobs() em server.ts após dbConnect().
 */

import cron from "node-cron";
import { logger } from "../utils/logger";
import { runFinanceiroDailyJobs } from "./financeiro-jobs";

export function initFinanceiroJobs(): void {
  // 08h00 SP = 11h00 UTC (UTC-3 fixo, sem DST)
  // node-cron suporta timezone nativo: { timezone: 'America/Sao_Paulo' }
  cron.schedule("0 8 * * *", async () => {
    try {
      await runFinanceiroDailyJobs();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("financeiro.cron.unhandled", { error: msg });
    }
  }, {
    timezone: "America/Sao_Paulo",
  });

  logger.info("financeiro.cron.registered", {
    schedule: "0 8 * * * (America/Sao_Paulo)",
  });
}
