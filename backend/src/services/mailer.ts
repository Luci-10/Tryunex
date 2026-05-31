import nodemailer from "nodemailer";

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (transporter) return transporter;
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    throw new Error(
      "Gmail not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD (app password, not your Google password).",
    );
  }
  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
  return transporter;
}

// Where contact-form submissions get delivered. Always includes the founder's
// inbox + the brand inbox (GMAIL_USER).
const CONTACT_RECIPIENTS = [process.env.GMAIL_USER, "shubhamsheshank63@gmail.com"];

export async function sendContactEmail(opts: {
  fromEmail: string;
  fromName: string;
  subject: string | null;
  message: string;
}) {
  const t = getTransporter();
  const from = `TryUnex Contact <${process.env.GMAIL_USER}>`;
  const subj = `[Contact] ${opts.subject?.trim() || "New message from " + opts.fromName}`;
  const text = `From: ${opts.fromName} <${opts.fromEmail}>\n\n${opts.message}`;
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
      <h2 style="color:#6d28d9;margin:0 0 16px;">TryUnex — new contact message</h2>
      <table style="font-size:14px;color:#333;border-collapse:collapse;width:100%;margin-bottom:16px;">
        <tr><td style="padding:4px 8px 4px 0;color:#666;width:80px;">From</td><td>${escapeHtml(opts.fromName)} &lt;<a href="mailto:${escapeAttr(opts.fromEmail)}">${escapeHtml(opts.fromEmail)}</a>&gt;</td></tr>
        ${opts.subject ? `<tr><td style="padding:4px 8px 4px 0;color:#666;">Subject</td><td>${escapeHtml(opts.subject)}</td></tr>` : ""}
      </table>
      <div style="background:#f5f3ff;padding:16px;border-radius:8px;white-space:pre-wrap;font-size:14px;color:#111;">${escapeHtml(opts.message)}</div>
      <p style="color:#888;font-size:12px;margin-top:24px;">Reply directly to ${escapeHtml(opts.fromEmail)} to respond.</p>
    </div>
  `;
  await t.sendMail({
    from,
    to: CONTACT_RECIPIENTS.filter(Boolean).join(", "),
    replyTo: opts.fromEmail,
    subject: subj,
    text,
    html,
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!,
  );
}
function escapeAttr(s: string): string {
  return escapeHtml(s);
}

export async function sendOtpEmail(to: string, otp: string) {
  const t = getTransporter();
  const from = `TryUnex <${process.env.GMAIL_USER}>`;
  const text = `Your TryUnex verification code is ${otp}. It expires in 10 minutes. If you didn't request this, you can ignore this email.`;
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
      <h2 style="color:#6d28d9;margin:0 0 12px;">TryUnex</h2>
      <p>Your verification code is:</p>
      <p style="font-size:32px;letter-spacing:8px;font-weight:700;color:#111;margin:16px 0;background:#f5f3ff;padding:16px;border-radius:12px;text-align:center;">${otp}</p>
      <p style="color:#555;font-size:14px;">It expires in 10 minutes. If you didn't request this, you can ignore this email.</p>
    </div>
  `;
  await t.sendMail({ from, to, subject: "Your TryUnex code", text, html });
}
