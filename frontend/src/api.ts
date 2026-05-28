// On the web (dev + prod), the frontend and API share the same origin so
// `/api/*` works directly. Inside the Capacitor Android/iOS app, the page is
// served from https://localhost — `/api` would hit the WebView's local
// bundle, not our backend. So when Capacitor is present we point at the
// production API explicitly.
const BASE = (typeof window !== "undefined" && (window as any).Capacitor)
  ? "https://www.tryunex.in/api"
  : "/api";

export type ApiError = { error: string } & Record<string, unknown>;

async function handle(res: Response) {
  const ct = res.headers.get("content-type") ?? "";
  const body = ct.includes("application/json") ? await res.json() : await res.text();
  if (!res.ok) {
    const err = typeof body === "object" && body && "error" in body ? (body as ApiError).error : String(body);
    throw new Error(err || `HTTP ${res.status}`);
  }
  return body;
}

export const api = {
  get: <T = any>(path: string) =>
    fetch(`${BASE}${path}`, { credentials: "include" }).then(handle) as Promise<T>,

  post: <T = any>(path: string, body?: unknown) =>
    fetch(`${BASE}${path}`, {
      method: "POST",
      credentials: "include",
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }).then(handle) as Promise<T>,

  patch: <T = any>(path: string, body: unknown) =>
    fetch(`${BASE}${path}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(handle) as Promise<T>,

  postForm: <T = any>(path: string, form: FormData) =>
    fetch(`${BASE}${path}`, { method: "POST", credentials: "include", body: form }).then(handle) as Promise<T>,

  delete: <T = any>(path: string) =>
    fetch(`${BASE}${path}`, { method: "DELETE", credentials: "include" }).then(handle) as Promise<T>,
};

export type User = {
  id: string;
  email: string;
  name: string;
  dob: string | null;
  gender: "male" | "female" | "other" | "prefer_not_to_say" | null;
  createdAt: string;
};

export type Cloth = {
  id: string;
  userId: string;
  name: string;
  category: string;
  imageUrl: string;
  status: "clean" | "worn";
  createdAt: string;
  lastWornOn?: string | null;
};
