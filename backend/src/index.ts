import app from "./app.js";

const PORT = Number(process.env.PORT ?? 3001);
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? "http://localhost:5173";

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✓ TryUnex backend on http://0.0.0.0:${PORT}`);
  console.log(`  CORS origin: ${FRONTEND_ORIGIN}`);
});
