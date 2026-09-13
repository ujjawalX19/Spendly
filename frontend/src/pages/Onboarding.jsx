/**
 * Onboarding.jsx — three screens, then the notification-access ask.
 *
 * The order here is the whole point. Spendly's best feature is automatic UPI
 * tracking, and it needs Notification Access — a permission Android presents
 * with a genuinely alarming warning screen. Asked cold on first launch, with
 * no explanation, most people decline, and a user who declines never sees the
 * thing that makes the app worth keeping.
 *
 * So: explain what the app does, explain what the permission is and
 * explicitly what it is not (it does not read SMS), and only then send them
 * to the settings screen. Skipping is always available and never penalised —
 * manual tracking works perfectly well.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { Zap, PieChart, TrendingUp, Bell, ShieldCheck, ArrowRight, Check } from 'lucide-react';

import { usePaymentNotifications } from '../hooks/usePaymentNotifications';

export const ONBOARDING_KEY = 'spendly.onboarded.v1';

/**
 * In-memory fallback.
 *
 * Without this, a browser with storage blocked (private mode, cleared site
 * data, some WebView configurations) would loop: ProtectedRoute sees
 * "not onboarded" and sends the user to /welcome, /welcome finishes and
 * navigates to /dash, ProtectedRoute sends them back. The flag makes the
 * session at least complete, even if onboarding reappears next launch.
 */
let onboardedThisSession = false;

export function markOnboarded() {
  onboardedThisSession = true;
  try { window.localStorage.setItem(ONBOARDING_KEY, '1'); } catch { /* storage unavailable */ }
}

export function hasOnboarded() {
  if (onboardedThisSession) return true;
  try { return window.localStorage.getItem(ONBOARDING_KEY) === '1'; } catch { return false; }
}

const SLIDES = [
  {
    icon: Zap,
    tint: 'text-lime-400 bg-lime-400/15',
    title: 'Track without typing',
    body: 'Spendly reads the payment notifications your UPI and bank apps already show you, and turns the real ones into expenses. No forms, no forgetting.',
  },
  {
    icon: PieChart,
    tint: 'text-sky-400 bg-sky-400/15',
    title: 'See where it actually goes',
    body: 'Categories, trends, and the subscriptions you forgot you were paying for. The numbers explain themselves.',
  },
  {
    icon: TrendingUp,
    tint: 'text-amber-400 bg-amber-400/15',
    title: 'Know what you can spend',
    body: 'Not just what you spent. Safe-to-Spend works out what you can use each day until your next income — and shows you the assumptions behind it.',
  },
];

export default function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const { isSupported, permissionGranted, requestPermission } = usePaymentNotifications();

  // The permission screen is Android-only; on web the third slide is the last.
  const showPermissionStep = isSupported && Capacitor.isNativePlatform() && !permissionGranted;
  const lastStep = showPermissionStep ? SLIDES.length : SLIDES.length - 1;

  const finish = () => {
    markOnboarded();
    navigate('/dash', { replace: true });
  };

  const next = () => (step >= lastStep ? finish() : setStep(step + 1));

  const onPermissionScreen = step === SLIDES.length;
  const slide = SLIDES[step];

  return (
    <div className="flex min-h-screen flex-col bg-black px-6 pb-8 pt-14 text-white">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col">

        <div className="mb-10 flex items-center justify-between">
          <div className="flex gap-1.5" role="progressbar" aria-valuenow={step + 1} aria-valuemin={1} aria-valuemax={lastStep + 1}>
            {Array.from({ length: lastStep + 1 }).map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${i === step ? 'w-7 bg-lime-400' : 'w-1.5 bg-white/15'}`}
              />
            ))}
          </div>
          <button type="button" onClick={finish} className="min-h-11 px-2 text-sm font-bold text-zinc-500 hover:text-zinc-300">
            Skip
          </button>
        </div>

        <AnimatePresence mode="wait">
          {onPermissionScreen ? (
            <motion.div
              key="perm"
              initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}
              transition={{ type: 'spring', stiffness: 300, damping: 28 }}
              className="flex flex-1 flex-col"
            >
              <span className="mb-7 flex h-16 w-16 items-center justify-center rounded-2xl bg-lime-400/15 text-lime-400">
                <Bell className="h-8 w-8" />
              </span>

              <h1 className="text-3xl font-black leading-tight tracking-tight">
                One permission,<br />and it tracks itself
              </h1>

              <p className="mt-4 text-base leading-relaxed text-zinc-400">
                To log payments automatically, Spendly needs Notification Access. Android will show a
                scary-looking warning on the next screen — here is exactly what this does.
              </p>

              <ul className="mt-6 space-y-3">
                {[
                  'Reads notifications from UPI and bank apps only, to spot payments.',
                  'Does not read your SMS, contacts, or anything you type.',
                  'Notification text never leaves your phone and is never logged.',
                  'You can switch it off in Android settings at any time.',
                ].map(line => (
                  <li key={line} className="flex gap-3 text-sm leading-relaxed text-zinc-300">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-lime-400" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-auto space-y-3 pt-8">
                <button
                  type="button"
                  onClick={async () => {
                    // Mark first: requestPermission sends the user out to the
                    // Android settings screen, and they should land on the
                    // dashboard when they come back, not here again.
                    markOnboarded();
                    await requestPermission();
                    navigate('/dash', { replace: true });
                  }}
                  className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-lime-400 text-base font-black text-black"
                >
                  Turn on automatic tracking <ArrowRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={finish}
                  className="min-h-12 w-full text-sm font-bold text-zinc-500 hover:text-zinc-300"
                >
                  Not now — I'll add expenses myself
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}
              transition={{ type: 'spring', stiffness: 300, damping: 28 }}
              className="flex flex-1 flex-col"
            >
              <span className={`mb-7 flex h-16 w-16 items-center justify-center rounded-2xl ${slide.tint}`}>
                <slide.icon className="h-8 w-8" />
              </span>

              <h1 className="text-3xl font-black leading-tight tracking-tight">{slide.title}</h1>
              <p className="mt-4 text-base leading-relaxed text-zinc-400">{slide.body}</p>

              <div className="mt-auto pt-8">
                <button
                  type="button"
                  onClick={next}
                  className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-lime-400 text-base font-black text-black"
                >
                  {step === lastStep ? <>Get started <Check className="h-4 w-4" /></> : <>Next <ArrowRight className="h-4 w-4" /></>}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
