import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import PulseMark from './PulseMark';

/**
 * Shared frame for sign-in, sign-up and password screens, in the same pieces
 * as the rest of the app: the gradient card carries the brand (the pulse draws
 * itself in once), a white-pill switch moves between signing in and creating
 * an account, and the form sits in a block. No invented balances or statistics.
 *
 * @param {{ children: React.ReactNode, tab?: 'login'|'signup' }} props
 *        `tab`: show the Sign in / Create account switch with this side selected.
 */
export default function AuthLayout({ children, tab }) {
  const navigate = useNavigate();
  return (
    <main className="min-h-screen bg-bg pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] text-ink">
      <div className="mx-auto w-full max-w-md px-5 pb-12 pt-6">
        {/* Brand */}
        <section className="v-hero-card v-enter p-5" aria-label="Vittova, your money's pulse">
          <div className="flex items-start justify-between">
            <p className="text-xs text-white/75">your money&apos;s pulse</p>
            <PulseMark width={44} draw />
          </div>
          <p className="mt-5 text-[30px] font-semibold leading-none">Vittova</p>
          <p className="mt-2.5 text-[13px] text-white/80">Know what your money can do next.</p>
        </section>

        {tab && (
          <div className="v-seg mt-4 flex w-full [&>button]:min-h-10 [&>button]:flex-1" role="tablist" aria-label="Account">
            <button type="button" role="tab" aria-selected={tab === 'login'} aria-pressed={tab === 'login'} onClick={() => tab !== 'login' && navigate('/login')}>Sign in</button>
            <button type="button" role="tab" aria-selected={tab === 'signup'} aria-pressed={tab === 'signup'} onClick={() => tab !== 'signup' && navigate('/signup')}>Create account</button>
          </div>
        )}

        {/* Form */}
        <section className="v-block v-enter mt-4 p-5">
          {children}
        </section>
      </div>
    </main>
  );
}

/** "or" between the email form and Google. */
export function OrDivider() {
  return (
    <div className="flex items-center gap-3" role="separator" aria-label="or">
      <span className="h-px flex-1 bg-line-strong" />
      <span className="text-xs text-ink-3">or</span>
      <span className="h-px flex-1 bg-line-strong" />
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
