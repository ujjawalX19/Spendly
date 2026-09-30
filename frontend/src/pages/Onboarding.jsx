/**
 * Onboarding.jsx — three screens, then the bank-SMS ask.
 *
 * Vittova's best feature is automatic tracking, and payment apps mostly post
 * no notification for a payment: the reliable signal is the bank's debit SMS.
 * Asked cold, with no explanation, most people decline an SMS permission.
 *
 * So: explain what the app does, then exactly what is read and kept (business
 * senders only, never messages from people; amount, payee, bank and time only)
 * — this screen is Google Play's prominent disclosure — and only then show
 * Android's dialog, from a tap. Skipping is always available and never
 * penalised: manual tracking works perfectly well. Payment-app notifications
 * are an optional extra in Profile.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import VittovaLogo from '../components/VittovaLogo';
import { Capacitor } from '@capacitor/core';
import { Zap, PieChart, TrendingUp, MessageSquareText, ShieldCheck, ArrowRight, Check } from 'lucide-react';

import { usePaymentNotifications } from '../hooks/usePaymentNotifications';
import { usePaymentTracking } from '../contexts/PaymentTrackingContext';
import { recordNotificationPromptDismissed } from '../lib/notificationPrompt';
import { SMS_DISCLOSURE } from '../components/SmsAccessSheet';

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
    body: "With your permission, Vittova adds payments from your bank's debit SMS to your expenses automatically, even when the app is closed. Or add expenses yourself — both work.",
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
  const { isSupported, openAppSettings } = usePaymentNotifications();
  const tracking = usePaymentTracking();
  const [asking, setAsking] = useState(false);
  const [declined, setDeclined] = useState(false);

  // The permission screen is Android-only; on web the third slide is the last.
  const showPermissionStep = isSupported && Capacitor.isNativePlatform() && !tracking.smsGranted;
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
                <MessageSquareText className="h-8 w-8" />
              </span>

              <h1 className="text-3xl font-black leading-tight tracking-tight">
                One permission,<br />and it tracks itself
              </h1>

              <p className="mt-4 text-base leading-relaxed text-zinc-400">
                Payment apps rarely announce a payment, but your bank always sends a debit SMS. With SMS access,
                Vittova turns those alerts into expenses. Here is exactly what it reads and keeps.
              </p>

              <ul className="mt-6 space-y-3">
                {SMS_DISCLOSURE.map(line => (
                  <li key={line} className="flex gap-3 text-sm leading-relaxed text-zinc-300">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-lime-400" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>

              {declined && (
                <p role="status" className="mt-5 rounded-xl border border-amber-400/25 bg-amber-400/[.06] p-3 text-sm text-amber-100">
                  {tracking.smsPermission === 'denied'
                    ? 'Android will not ask again. You can allow SMS later in App info → Permissions → SMS.'
                    : "SMS access wasn't allowed. You can add expenses yourself, or allow it later in Profile."}
                </p>
              )}

              <div className="mt-auto space-y-3 pt-8">
                {tracking.smsPermission === 'denied' && declined ? (
                  <button
                    type="button"
                    onClick={() => { markOnboarded(); openAppSettings(); }}
                    className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-lime-400 text-base font-black text-black"
                  >
                    Open App info <ArrowRight className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={asking}
                    onClick={async () => {
                      // Mark first: if Android restarts the app during its
                      // dialog, the user should land on Home, not here again.
                      markOnboarded();
                      setAsking(true);
                      const info = await tracking.requestSms();
                      setAsking(false);
                      if (info?.smsGranted) finish();
                      else setDeclined(true);
                    }}
                    className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-lime-400 text-base font-black text-black disabled:opacity-60"
                  >
                    {asking ? 'Waiting for Android…' : <>Allow bank SMS <ArrowRight className="h-4 w-4" /></>}
                  </button>
                )}
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
