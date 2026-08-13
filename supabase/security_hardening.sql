-- ═══════════════════════════════════════════════════════════════
-- Spendly Security Hardening — Supabase SQL Migration
-- Run this in Supabase SQL Editor (Dashboard → SQL)
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. VERIFY RLS IS ENABLED ON ALL TABLES ──────────────────
-- These are idempotent — safe to run multiple times.
ALTER TABLE public.profiles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_expenses       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_expense_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlements          ENABLE ROW LEVEL SECURITY;


-- ─── 2. LOCK DOWN PROFILE UPDATE PERMISSIONS ─────────────────
-- Problem: By default, the `authenticated` role can UPDATE any column
-- on profiles (including `role`, `karma_score`, `is_banned`).
-- A malicious user could set their own role to 'admin'.
--
-- Solution: Revoke blanket UPDATE and only grant UPDATE on safe columns.

-- Step A: Revoke all UPDATE rights on profiles for authenticated users
REVOKE UPDATE ON public.profiles FROM authenticated;

-- Step B: Grant UPDATE only on non-sensitive columns
-- Users can change their display name and monthly budget, nothing else.
GRANT UPDATE (full_name, monthly_budget) ON public.profiles TO authenticated;

-- ─── 3. RESTRICT UPDATE POLICY TO OWN ROW ────────────────────
-- Drop the existing permissive update policy and replace with a stricter one.
-- This ensures users can only UPDATE their own profile row.
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can update own profile (restricted columns)"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);


-- ═══════════════════════════════════════════════════════════════
-- DONE! Column-level restrictions and RLS verified.
-- 
-- NOTE: The backend uses SUPABASE_SERVICE_ROLE_KEY which BYPASSES
-- RLS entirely. Backend-driven updates to karma_score, total_chillar,
-- streak, and role (admin panel) will continue to work normally.
-- Only direct client-side Supabase calls are restricted.
-- ═══════════════════════════════════════════════════════════════
