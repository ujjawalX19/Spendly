import { Loader2 } from 'lucide-react';
import VittovaLogo from './VittovaLogo';

/**
 * Shared frame for sign-in, sign-up and password screens: the mark, the name,
 * and the form straight on the page. No decoration, no invented balances or
 * statistics.
 */
export default function AuthLayout({ children }) {
  return (
    <main className="min-h-screen bg-bg pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] text-ink">
      <div className="mx-auto grid min-h-screen max-w-5xl grid-cols-1 lg:grid-cols-2 lg:gap-12">
        {/* Brand */}
        <aside className="v-enter flex items-center gap-3 px-6 pb-6 pt-10 lg:flex-col lg:items-start lg:justify-center lg:gap-0 lg:pb-14">
          <VittovaLogo size={40} className="lg:hidden" />
          <VittovaLogo size={72} className="hidden lg:block" />
          <div className="lg:mt-6">
            <p className="font-display text-xl font-bold leading-tight lg:text-5xl">Vittova</p>
            <p className="text-[13px] text-ink-2 lg:mt-2 lg:text-xl">
              your money&apos;s pulse
            </p>
          </div>
        </aside>

        {/* Form */}
        <section className="flex items-start justify-center px-6 pb-14 lg:items-center lg:py-12">
          <div className="v-enter w-full max-w-md lg:rounded-3xl lg:bg-surface lg:p-8">
            {children}
          </div>
        </section>
      </div>
    </main>
  );
}

/** "or" between the email form and Google. */
export function OrDivider() {
  return (
    <div className="flex items-center gap-3" role="separator" aria-label="or">
      <span className="h-px flex-1 bg-line" />
      <span className="text-xs text-ink-3">or</span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

/** Continue with Google: Google's in-app sheet on Android, a redirect on the website (see AuthContext). */
export function GoogleButton({ onClick, loading, disabled }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled || loading}
      className="v-press v-btn-secondary min-h-12 w-full gap-3 text-[15px] disabled:cursor-not-allowed">
      {loading ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : (
        <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </svg>
      )}
      Continue with Google
    </button>
  );
}
