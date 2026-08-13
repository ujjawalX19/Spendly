-- ═══════════════════════════════════════════════════════════════
-- Migration: Add `is_banned` column to `profiles` table
-- Run this in Supabase SQL Editor (Dashboard → SQL)
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.profiles
  ADD COLUMN is_banned boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.is_banned IS
  'Admin-controlled flag. When true the user is banned from the platform.';

-- Optional: Add a role column if it doesn't exist yet.
-- The admin portal relies on a `role` field to gate access.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user';

COMMENT ON COLUMN public.profiles.role IS
  'User role. Possible values: user, admin.';
