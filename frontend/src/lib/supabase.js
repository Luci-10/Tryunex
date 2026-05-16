import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  document.body.innerHTML =
    '<div style="font-family:sans-serif;padding:2rem;color:#c00">' +
    "<h2>Configuration error</h2>" +
    "<p>VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are not set.</p>" +
    "<p>Add them in your Vercel project → Settings → Environment Variables, then redeploy.</p>" +
    "</div>";
  throw new Error("Missing Supabase env vars");
}

export const supabase = createClient(url, key);
