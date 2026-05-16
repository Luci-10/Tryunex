const API_BASE = import.meta.env.VITE_API_URL ?? "";
const TRYON_BASE = import.meta.env.VITE_TRYON_URL ?? "";

const post = (url, body) =>
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => r.json());

export const sendOtp = (email) => post(`${API_BASE}/api/auth/send-otp`, { email });
export const verifyOtp = (email, otp, token) => post(`${API_BASE}/api/auth/verify-otp`, { email, otp, token });
export const suggestOutfit = (occasion, items) => post(`${API_BASE}/api/ai/suggest`, { occasion, items });
export const generateTryOn = (personImage, garmentImage, description) =>
  post(`${TRYON_BASE}/tryon/generate`, { personImage, garmentImage, description });
