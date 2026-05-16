-- Replace age with date of birth, add phone
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS dob   DATE,
  ADD COLUMN IF NOT EXISTS phone TEXT;
