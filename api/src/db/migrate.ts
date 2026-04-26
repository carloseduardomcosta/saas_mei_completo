import "dotenv/config";
import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { db } from "./index";
import { logger } from "../utils/logger";

async function migrate(): Promise<void> {
  // Garante que a tabela de controle existe antes de qualquer migration
  await db.query(`
    CREATE TABLE IF NOT EXISTS public.migrations (
      id       SERIAL       PRIMARY KEY,
      filename VARCHAR(200) UNIQUE NOT NULL,
      run_on   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `);

  const migrationsDir =
    process.env.MIGRATIONS_DIR ?? join(__dirname, "../../../db/migrations");

  const files = (await readdir(migrationsDir))
    .filter((f) => f.endsWith(".sql"))
    .sort(); // ordem lexicográfica garante sequência numérica (001_, 002_, ...)

  const { rows: ran } = await db.query<{ filename: string }>(
    "SELECT filename FROM public.migrations ORDER BY filename"
  );
  const ranSet = new Set(ran.map((r) => r.filename));

  let count = 0;
  for (const file of files) {
    if (ranSet.has(file)) continue;

    logger.info(`Rodando migration: ${file}`);
    const sql = await readFile(join(migrationsDir, file), "utf-8");

    const client = await db.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(
        "INSERT INTO public.migrations (filename) VALUES ($1)",
        [file]
      );
      await client.query("COMMIT");
      count++;
      logger.info(`Migration concluída: ${file}`);
    } catch (err) {
      await client.query("ROLLBACK");
      logger.error(`Falha na migration: ${file}`, { error: (err as Error).message });
      throw err;
    } finally {
      client.release();
    }
  }

  if (count === 0) logger.info("Banco já está atualizado — nenhuma migration pendente");
  else logger.info(`${count} migration(s) aplicada(s) com sucesso`);

  await db.end();
}

migrate().catch((err) => {
  logger.error("Erro fatal nas migrations", { error: err.message });
  process.exit(1);
});
