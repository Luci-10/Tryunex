import nodemailer from "nodemailer";

let transporter: nodemailer.Transporter | null = null;

/**
 * Where mail is sent from.
 *
 * Sending transactional mail from a @gmail.com address is why sign-in codes
 * land in spam: the app is tryunex.in, but the mail claims to come from
 * gmail.com, so there is no SPF or DKIM record on our own domain vouching for
 * it. Receiving servers see a service email from a free consumer account with
 * nothing backing it, which is exactly what a phisher looks like.
 *
 * Set SMTP_HOST/SMTP_USER/SMTP_PASS to send through a provider that signs for
 * tryunex.in instead. Until those exist the Gmail path still works, so this
 * change is safe to deploy before the DNS records are in place.
 */
function smtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

/**
 * The staffed inbox, and the default for both From and Reply-To.
 *
 * Deliberately not GMAIL_USER. That was the previous fallback, which meant a
 * missing environment variable silently published a personal Gmail address as
 * the reply address on every sign-in code — visible to every user, and exactly
 * what the move to a domain address was meant to stop.
 */
const SUPPORT_INBOX = "contact@tryunex.in";

/** The visible From. A domain address is the entire point of the change. */
export function mailFrom(): string {
  return process.env.MAIL_FROM ?? `TryUnex <${SUPPORT_INBOX}>`;
}

/** Replies should reach a human, not the unattended sending address. */
function replyTo(): string {
  return process.env.MAIL_REPLY_TO ?? SUPPORT_INBOX;
}

function getTransporter() {
  if (transporter) return transporter;

  if (smtpConfigured()) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      // 587 is STARTTLS, 465 is implicit TLS. Neither is plaintext.
      secure: Number(process.env.SMTP_PORT ?? 587) === 465,
      auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
    });
    return transporter;
  }

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    throw new Error(
      "Email not configured. Set SMTP_HOST/SMTP_USER/SMTP_PASS, or GMAIL_USER and GMAIL_APP_PASSWORD.",
    );
  }
  transporter = nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
  return transporter;
}

// Where contact-form submissions get delivered: the staffed support inbox.
// MAIL_REPLY_TO is that inbox by definition, so it is the same address a user
// gets when they reply to any mail we send.
const CONTACT_RECIPIENTS = [process.env.MAIL_REPLY_TO ?? SUPPORT_INBOX];

export async function sendContactEmail(opts: {
  fromEmail: string;
  fromName: string;
  subject: string | null;
  message: string;
}) {
  const t = getTransporter();
  const from = mailFrom();
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
  const from = mailFrom();
  const text = `Your TryUnex verification code is ${otp}. It expires in 10 minutes. If you didn't request this, you can ignore this email.`;
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
      <h2 style="color:#6d28d9;margin:0 0 12px;">TryUnex</h2>
      <p>Your verification code is:</p>
      <p style="font-size:32px;letter-spacing:8px;font-weight:700;color:#111;margin:16px 0;background:#f5f3ff;padding:16px;border-radius:12px;text-align:center;">${otp}</p>
      <p style="color:#555;font-size:14px;">It expires in 10 minutes. If you didn't request this, you can ignore this email.</p>
    </div>
  `;
  await t.sendMail({ from, to, subject: "Your TryUnex code", text, html, replyTo: replyTo() });
}

/**
 * Confirmation code for permanent account deletion.
 *
 * Worded so that someone who did *not* ask for this understands it matters and
 * knows what to do — unlike a sign-in code, ignoring this one is not the whole
 * story if their session is in someone else's hands.
 */
export async function sendAccountDeletionEmail(to: string, otp: string) {
  const t = getTransporter();
  const from = mailFrom();
  const text =
    `Your TryUnex account deletion code is ${otp}. It expires in 10 minutes.\n\n` +
    `Entering it permanently deletes your account, your wardrobe and your photos. This cannot be undone.\n\n` +
    `If you did not request this, do not share the code. Someone may have access to your signed-in device — ` +
    `sign out of TryUnex everywhere and contact us at ${from}.`;
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
      <h2 style="color:#6d28d9;margin:0 0 12px;">TryUnex</h2>
      <p>Your account deletion code is:</p>
      <p style="font-size:32px;letter-spacing:8px;font-weight:700;color:#111;margin:16px 0;background:#fef2f2;padding:16px;border-radius:12px;text-align:center;">${otp}</p>
      <p style="color:#b91c1c;font-size:14px;font-weight:600;">
        Entering this code permanently deletes your account, your wardrobe and your photos. This cannot be undone.
      </p>
      <p style="color:#555;font-size:14px;">
        It expires in 10 minutes. If you didn't request this, do not share the code — someone may have access to
        your signed-in device. Sign out of TryUnex everywhere and contact us at ${escapeHtml(from)}.
      </p>
    </div>
  `;
  await t.sendMail({ from, to, subject: "Confirm deleting your TryUnex account", text, html, replyTo: replyTo() });
}
