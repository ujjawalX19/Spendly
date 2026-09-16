/**
 * Onboarding.jsx — three screens, then the notification-access ask.
 *
 * The order here is the whole point. Vittova's best feature is automatic UPI
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
import VittovaLogo from '../components/VittovaLogo';
import { Capacitor } from '@capacitor/core';
import { Zap, PieChart, TrendingUp, Bell, ShieldCheck, ArrowRight, Check } from 'lucide-react';

import { usePaymentNotifications } from '../hooks/usePaymentNotifications';
import { SUPPORTED_PAYMENT_APPS } from '../lib/supportedPaymentApps';
import { recordNotificationPromptDismissed } from '../lib/notificationPrompt';

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
    body: 'With your permission, Vittova spots payment notifications from supported UPI and bank apps and asks before adding them as expenses. Or add expenses yourself — both work.',
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
    body: 'Not just what you spent. Safe-to-Spend works out what is left to use each day this month, based on your budget and bills.',
  },
];

export default function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const { isSupported, permissionGranted, openPermissionSettings } = usePaymentNotifications();

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
    <div className="flex min-h-screen flex-col bg-black px-6 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-[calc(3.5rem+env(safe-area-inset-top))] text-white">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col">

        <div className="mb-6 flex items-center gap-2.5">
          <VittovaLogo size={32} />
          <span className="leading-tight">
            <span className="block text-sm font-extrabold tracking-[.16em] text-white">VITTOVA</span>
            <span className="block text-[10px] font-bold tracking-[.12em] text-lime-300">YOUR MONEY&apos;S PULSE</span>
          </span>
        </div>

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
                To detect payments automatically, Vittova needs Android Notification Access. Android shows a
                strong warning because this access is powerful, so here is exactly how Vittova uses it.
              </p>

              <ul className="mt-6 space-y-3">
                {[
                  'Only notifications from the supported payment and bank apps listed below are processed. Notifications from WhatsApp, messages, email, social and every other app are ignored.',
                  'From a payment notification Vittova keeps only the amount, payee name, app name and time. The notification text itself is not stored or uploaded.',
                  'Nothing is added to your account until you tap "Add expense". Then the amount, payee and time are saved to your Vittova account.',
                  'Vittova does not read SMS, contacts, or anything you type. You can turn this off in Android settings at any time.',
                ].map(line => (
                  <li key={line} className="flex gap-3 text-sm leading-relaxed text-zinc-300">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-lime-400" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>

              <details className="mt-5 rounded-xl border border-white/10 bg-white/[.03] p-3 text-xs text-zinc-400">
                <summary className="cursor-pointer font-bold text-zinc-300">Supported apps ({SUPPORTED_PAYMENT_APPS.length})</summary>
                <p className="mt-2 leading-relaxed">{SUPPORTED_PAYMENT_APPS.map((a) => a.name).join(', ')}</p>
              </details>

              <div className="mt-auto space-y-3 pt-8">
                <button
                  type="button"
                  onClick={async () => {
                    // Mark first: requestPermission sends the user out to the
                    // Android settings screen, and they should land on the
                    // dashboard when they come back, not here again.
                    markOnboarded();
                    await openPermissionSettings();
                    navigate('/dash', { replace: true });
                  }}
                  className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-lime-400 text-base font-black text-black"
                >
                  Turn on automatic tracking <ArrowRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => { recordNotificationPromptDismissed(); finish(); }}
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
