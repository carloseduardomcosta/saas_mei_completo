// Templates de email para o módulo de Agenda.
// Usa o mesmo client SES do BibelôCRM/MEI Completo (sesSendEmail).
// TODO: mover sesSendEmail para um módulo shared quando MEI Completo ganhar seu próprio repo.

import { sesSendEmail } from "../integrations/ses/client";
import { queryOne } from "../db";

const FROM_EMAIL =
  process.env.AGENDA_FROM_EMAIL ||
  process.env.FROM_EMAIL ||
  "agenda@meicompleto.com.br";

// ── Helpers ────────────────────────────────────────────────────────────────

/** Formata Date para "Dia, DD de Mês de YYYY às HH:MM" em PT-BR/SP. */
function formatDatetimeSP(date: Date): string {
  return date.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Formata centavos para "R$ 0,00". */
function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

// ── Template base ──────────────────────────────────────────────────────────

function emailWrapper(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border-radius:8px;overflow:hidden;
                      box-shadow:0 1px 4px rgba(0,0,0,.08);max-width:600px;width:100%;">
          <!-- Cabeçalho -->
          <tr>
            <td style="background:#2563eb;padding:28px 32px;">
              <p style="margin:0;color:#fff;font-size:20px;font-weight:700;letter-spacing:-.3px;">
                MEI Completo · Agenda
              </p>
            </td>
          </tr>
          <!-- Corpo -->
          <tr>
            <td style="padding:32px;">
              ${body}
            </td>
          </tr>
          <!-- Rodapé -->
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">
                Este email foi gerado automaticamente — não responda a esta mensagem.<br/>
                MEI Completo · Gerenciamento simples para microempreendedores
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ── Email de confirmação ao CLIENTE ───────────────────────────────────────

export interface BookingConfirmationParams {
  bookingId: string;
  clientName: string;
  clientEmail: string;
  serviceName: string;
  businessName: string;
  startsAt: Date;
  durationMinutes: number;
  priceCents: number;
}

function buildClientConfirmationHtml(p: BookingConfirmationParams): string {
  const endsAt = new Date(p.startsAt.getTime() + p.durationMinutes * 60_000);

  const body = `
    <h1 style="margin:0 0 8px;font-size:22px;color:#111827;font-weight:700;">
      Agendamento confirmado! ✅
    </h1>
    <p style="margin:0 0 28px;font-size:15px;color:#6b7280;">
      Olá, <strong>${p.clientName}</strong>. Seu agendamento foi confirmado com sucesso.
    </p>

    <!-- Card de detalhes -->
    <table width="100%" cellpadding="0" cellspacing="0"
           style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;
                  margin-bottom:28px;">
      <tr>
        <td style="padding:24px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding-bottom:14px;border-bottom:1px solid #e2e8f0;">
                <p style="margin:0;font-size:12px;color:#9ca3af;text-transform:uppercase;
                           letter-spacing:.05em;font-weight:600;">Estabelecimento</p>
                <p style="margin:4px 0 0;font-size:16px;color:#111827;font-weight:600;">
                  ${p.businessName}
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:14px 0;border-bottom:1px solid #e2e8f0;">
                <p style="margin:0;font-size:12px;color:#9ca3af;text-transform:uppercase;
                           letter-spacing:.05em;font-weight:600;">Serviço</p>
                <p style="margin:4px 0 0;font-size:16px;color:#111827;font-weight:600;">
                  ${p.serviceName}
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:14px 0;border-bottom:1px solid #e2e8f0;">
                <p style="margin:0;font-size:12px;color:#9ca3af;text-transform:uppercase;
                           letter-spacing:.05em;font-weight:600;">Data e horário</p>
                <p style="margin:4px 0 0;font-size:16px;color:#111827;font-weight:600;">
                  ${formatDatetimeSP(p.startsAt)}
                </p>
                <p style="margin:2px 0 0;font-size:13px;color:#6b7280;">
                  Duração: ${p.durationMinutes} min
                  (até ${endsAt.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })})
                </p>
              </td>
            </tr>
            ${
              p.priceCents > 0
                ? `<tr>
                <td style="padding-top:14px;">
                  <p style="margin:0;font-size:12px;color:#9ca3af;text-transform:uppercase;
                             letter-spacing:.05em;font-weight:600;">Valor</p>
                  <p style="margin:4px 0 0;font-size:18px;color:#111827;font-weight:700;">
                    ${formatBRL(p.priceCents)}
                  </p>
                  <p style="margin:2px 0 0;font-size:12px;color:#9ca3af;">
                    Pagamento presencial no dia do atendimento
                  </p>
                </td>
              </tr>`
                : ""
            }
          </table>
        </td>
      </tr>
    </table>

    <p style="font-size:14px;color:#6b7280;line-height:1.6;">
      📅 Adicione à sua agenda e não esqueça!<br/>
      Se precisar cancelar, entre em contato diretamente com o estabelecimento.
    </p>

    <p style="font-size:12px;color:#9ca3af;margin-top:20px;">
      Código do agendamento: <code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;
      font-family:monospace;">${p.bookingId.slice(0, 8).toUpperCase()}</code>
    </p>
  `;

  return emailWrapper(`Agendamento confirmado — ${p.businessName}`, body);
}

export async function sendBookingConfirmation(
  p: BookingConfirmationParams
): Promise<void> {
  const html = buildClientConfirmationHtml(p);
  await sesSendEmail({
    from: FROM_EMAIL,
    to: p.clientEmail,
    subject: `✅ Agendamento confirmado — ${p.businessName}`,
    html,
    tags: [{ name: "modulo", value: "agenda" }, { name: "tipo", value: "confirmacao_cliente" }],
  });
}

// ── Email de notificação ao MEI ────────────────────────────────────────────

export interface MeiNotificationParams {
  meiId: string;
  businessName: string;
  bookingId: string;
  clientName: string;
  clientEmail: string;
  clientPhone?: string;
  serviceName: string;
  startsAt: Date;
  durationMinutes: number;
}

function buildMeiNotificationHtml(p: MeiNotificationParams): string {
  const body = `
    <h1 style="margin:0 0 8px;font-size:22px;color:#111827;font-weight:700;">
      Novo agendamento recebido 🗓️
    </h1>
    <p style="margin:0 0 28px;font-size:15px;color:#6b7280;">
      Um novo cliente agendou um serviço em <strong>${p.businessName}</strong>.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0"
           style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;margin-bottom:28px;">
      <tr>
        <td style="padding:24px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding-bottom:12px;border-bottom:1px solid #d1fae5;">
                <p style="margin:0;font-size:12px;color:#6b7280;text-transform:uppercase;
                           letter-spacing:.05em;font-weight:600;">Cliente</p>
                <p style="margin:4px 0 0;font-size:16px;color:#111827;font-weight:600;">
                  ${p.clientName}
                </p>
                <p style="margin:2px 0 0;font-size:13px;color:#6b7280;">${p.clientEmail}</p>
                ${p.clientPhone ? `<p style="margin:2px 0 0;font-size:13px;color:#6b7280;">${p.clientPhone}</p>` : ""}
              </td>
            </tr>
            <tr>
              <td style="padding:12px 0;border-bottom:1px solid #d1fae5;">
                <p style="margin:0;font-size:12px;color:#6b7280;text-transform:uppercase;
                           letter-spacing:.05em;font-weight:600;">Serviço</p>
                <p style="margin:4px 0 0;font-size:16px;color:#111827;font-weight:600;">
                  ${p.serviceName} (${p.durationMinutes} min)
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding-top:12px;">
                <p style="margin:0;font-size:12px;color:#6b7280;text-transform:uppercase;
                           letter-spacing:.05em;font-weight:600;">Data e horário</p>
                <p style="margin:4px 0 0;font-size:18px;color:#166534;font-weight:700;">
                  ${formatDatetimeSP(p.startsAt)}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <p style="font-size:14px;color:#6b7280;line-height:1.6;">
      Acesse seu painel para confirmar, cancelar ou marcar como concluído.
    </p>

    <p style="font-size:12px;color:#9ca3af;margin-top:20px;">
      Código: <code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;
      font-family:monospace;">${p.bookingId.slice(0, 8).toUpperCase()}</code>
    </p>
  `;

  return emailWrapper(`Novo agendamento — ${p.clientName}`, body);
}

export async function sendMeiNotification(
  p: MeiNotificationParams
): Promise<void> {
  // Busca o email do MEI no banco de dados
  const user = await queryOne<{ email: string }>(
    `SELECT email FROM public.users WHERE id = $1`,
    [p.meiId]
  );

  if (!user?.email) return;

  const html = buildMeiNotificationHtml(p);
  await sesSendEmail({
    from: FROM_EMAIL,
    to: user.email,
    subject: `🗓️ Novo agendamento — ${p.clientName} · ${p.serviceName}`,
    html,
    tags: [{ name: "modulo", value: "agenda" }, { name: "tipo", value: "notificacao_mei" }],
  });
}

// ── Lembrete 24h antes (chamado por cron job) ─────────────────────────────

export interface ReminderParams {
  bookingId: string;
  clientName: string;
  clientEmail: string;
  serviceName: string;
  businessName: string;
  startsAt: Date;
  durationMinutes: number;
}

export async function sendBookingReminder(p: ReminderParams): Promise<void> {
  const endsAt = new Date(p.startsAt.getTime() + p.durationMinutes * 60_000);

  const body = `
    <h1 style="margin:0 0 8px;font-size:22px;color:#111827;font-weight:700;">
      Lembrete: seu agendamento é amanhã! ⏰
    </h1>
    <p style="margin:0 0 20px;font-size:15px;color:#6b7280;">
      Olá, <strong>${p.clientName}</strong>! Este é um lembrete do seu agendamento.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0"
           style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;margin-bottom:24px;">
      <tr>
        <td style="padding:20px;">
          <p style="margin:0;font-size:15px;color:#92400e;font-weight:600;">${p.businessName}</p>
          <p style="margin:6px 0 0;font-size:18px;color:#111827;font-weight:700;">
            ${formatDatetimeSP(p.startsAt)}
          </p>
          <p style="margin:4px 0 0;font-size:13px;color:#6b7280;">
            ${p.serviceName} · até ${endsAt.toLocaleTimeString("pt-BR", {
              timeZone: "America/Sao_Paulo",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </td>
      </tr>
    </table>
    <p style="font-size:14px;color:#6b7280;">
      Nos vemos amanhã! Se precisar cancelar, entre em contato diretamente.
    </p>
  `;

  await sesSendEmail({
    from: FROM_EMAIL,
    to: p.clientEmail,
    subject: `⏰ Lembrete — ${p.serviceName} amanhã às ${p.startsAt.toLocaleTimeString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
    })}`,
    html: emailWrapper(`Lembrete — ${p.businessName}`, body),
    tags: [{ name: "modulo", value: "agenda" }, { name: "tipo", value: "lembrete_24h" }],
  });
}
