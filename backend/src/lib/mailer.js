import "dotenv/config";
import nodemailer from "nodemailer";

const transport = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

export async function sendOtpEmail(to, otp) {
  await transport.sendMail({
    from: `Tryunex <${process.env.GMAIL_USER}>`,
    to,
    subject: "Your Tryunex login code",
    text: `Your Tryunex login code: ${otp}\n\nExpires in 15 minutes.`,
    html: `
      <div style="font-family:sans-serif;max-width:420px;margin:0 auto;padding:32px 24px;background:#f9f9f7;border-radius:12px">
        <h2 style="color:#1a1a1a;margin:0 0 8px">Your Tryunex login code</h2>
        <p style="color:#555;margin:0 0 24px;font-size:14px">Enter this code to sign in. Expires in 15 minutes.</p>
        <div style="background:#fff;border-radius:8px;padding:24px;text-align:center;margin-bottom:24px">
          <span style="font-size:40px;font-weight:700;letter-spacing:12px;color:#1a1a1a">${otp}</span>
        </div>
        <p style="color:#888;font-size:13px;margin:0">If you didn't request this, ignore this email.</p>
      </div>
    `,
  });
}
