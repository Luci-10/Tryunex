const post = (url, body) =>
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => r.json());

export const sendOtp = (email) => post("/api/auth/send-otp", { email });
export const verifyOtp = (email, otp, token) => post("/api/auth/verify-otp", { email, otp, token });
export const suggestOutfit = (occasion, items) => post("/api/ai/suggest", { occasion, items });
export const generateTryOn = (personImage, garmentImage, description) =>
  post("/tryon/generate", { personImage, garmentImage, description });
