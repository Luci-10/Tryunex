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
