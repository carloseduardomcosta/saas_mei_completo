import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { logger } from "../../utils/logger";

const ses = new SESv2Client({
  region: process.env.AWS_SES_REGION ?? "sa-east-1",
  credentials:
    process.env.AWS_SES_ACCESS_KEY_ID && process.env.AWS_SES_SECRET_ACCESS_KEY
      ? {
          accessKeyId: process.env.AWS_SES_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SES_SECRET_ACCESS_KEY,
        }
      : undefined,
});

const FROM_ADDRESS = process.env.AGENDA_FROM_EMAIL ?? "agenda@meicompleto.com.br";

export async function sesSendEmail(params: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
  tags?: Array<{ name: string; value: string }>;
}): Promise<void> {
  if (process.env.NODE_ENV !== "production" && !process.env.SES_FORCE) {
    logger.info(`[SES-DEV] Email para ${params.to} — ${params.subject}`);
    return;
  }

  const cmd = new SendEmailCommand({
    FromEmailAddress: params.from ?? FROM_ADDRESS,
    Destination: { ToAddresses: [params.to] },
    Content: {
      Simple: {
        Subject: { Data: params.subject, Charset: "UTF-8" },
        Body: {
          Html: { Data: params.html, Charset: "UTF-8" },
          ...(params.text ? { Text: { Data: params.text, Charset: "UTF-8" } } : {}),
        },
        Headers: params.tags?.map((t) => ({ Name: `X-Tag-${t.name}`, Value: t.value })),
      },
    },
  });

  await ses.send(cmd);
}
