-- Add onboarding fields to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS age    SMALLINT,
  ADD COLUMN IF NOT EXISTS gender TEXT;
