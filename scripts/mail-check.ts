import "dotenv/config";
import nodemailer from "nodemailer";
import { requireMail } from "../src/lib/mail";
async function main() {
  requireMail();
  if (!process.env.SMTP_HOST) {
    console.log(
      "Resend settings are present. Verify the sender domain in Resend and test a verification email to your own account; no email was sent by this command.",
    );
    return;
  }
  const port = Number(process.env.SMTP_PORT || 465);
  if (![465, 587].includes(port))
    throw new Error("Use TLS port 465 or STARTTLS 587");
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    requireTLS: true,
    tls: { rejectUnauthorized: true, minVersion: "TLSv1.2" },
    auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
    connectionTimeout: 15000,
  });
  try {
    await transport.verify();
    console.log(
      "SMTP connection and authentication passed. No email was sent. Verify actual delivery with your own account before client onboarding.",
    );
  } finally {
    transport.close();
  }
}
main().catch(() => {
  console.error(
    "Email configuration or SMTP authentication failed. Check secret settings, Google 2-step verification/App Password and verified TLS connectivity. No secret values were printed.",
  );
  process.exitCode = 1;
});
