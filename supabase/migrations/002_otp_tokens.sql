-- OTP tokens table used by Netlify Functions for custom email OTP auth
-- Only accessible via service role key (backend). Service role bypasses RLS.
CREATE TABLE IF NOT EXISTS public.otp_tokens (
  email       TEXT PRIMARY KEY,
  otp         TEXT        NOT NULL,
  name        TEXT        NOT NULL DEFAULT '',
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.otp_tokens ENABLE ROW LEVEL SECURITY;
-- No policies → anon/authenticated roles cannot read or write this table
