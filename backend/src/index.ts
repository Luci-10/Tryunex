import app from "./app.js";

const PORT = Number(process.env.PORT ?? 3001);
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? "http://localhost:5173";

app.listen(PORT, () => {
  console.log(`✓ Wordrobe backend on http://localhost:${PORT}`);
  console.log(`  CORS origin: ${FRONTEND_ORIGIN}`);
});
