import nodemailer from "nodemailer";
import { HttpError } from "./http";
export function mailReady() {
  return !!(
    process.env.MAIL_FROM &&
    ((process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS) ||
      process.env.RESEND_API_KEY)
  );
}
export function requireMail() {
  if (!mailReady())
    throw new HttpError(
      503,
      "Email delivery is not configured. Please contact the service administrator.",
    );
}
export function verificationRequired() {
  return process.env.REQUIRE_EMAIL_VERIFICATION === "true";
}
export async function sendMail(to: string, subject: string, text: string) {
  requireMail();
  const from = process.env.MAIL_FROM!;
  if (process.env.SMTP_HOST) {
    const port = Number(process.env.SMTP_PORT || "465");
    if (![465, 587].includes(port))
      throw new Error("SMTP must use TLS port 465 or STARTTLS port 587");
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      requireTLS: true,
      tls: { rejectUnauthorized: true, minVersion: "TLSv1.2" },
      auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
      connectionTimeout: 15000,
      socketTimeout: 20000,
    });
    try {
      await transport.sendMail({
        from,
        to,
        subject,
        text,
        disableFileAccess: true,
        disableUrlAccess: true,
      });
    } catch {
      throw new HttpError(
        503,
        "Email could not be delivered. Check the sender configuration or contact support.",
      );
    } finally {
      transport.close();
    }
  } else {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [to], subject, text }),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok)
      throw new HttpError(
        503,
        "Email could not be delivered. Please retry or contact support.",
      );
  }
}
