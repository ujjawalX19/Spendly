import { Lock, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { usePro } from '../contexts/ProContext';

/**
 * ProGate — Wraps Pro-only features.
 * Shows a dimmed preview + upgrade CTA for free users.
 *
 * Usage:
 *   <ProGate feature="subscription_graveyard">
 *     <SubscriptionGraveyard />
 *   </ProGate>
 */
export default function ProGate({ feature, children, title = 'Pro Feature', description }) {
  const { canUse } = usePro();

  if (canUse(feature)) {
    return children;
  }

  return (
    <div className="relative overflow-hidden rounded-2xl">
      {/* Dimmed preview */}
      <div className="pointer-events-none select-none opacity-25 blur-sm" aria-hidden="true">
        {children}
      </div>

      {/* Overlay */}
      <div className="v-enter absolute inset-0 flex items-center justify-center rounded-2xl">
        <div className="max-w-sm px-6 text-center">
          <Lock className="mx-auto mb-3 h-6 w-6 text-ink-2" aria-hidden="true" />
          <h3 className="text-lg font-bold text-ink">{title}</h3>
          <p className="mt-1.5 text-sm text-ink-2">
            {description || 'This is planned for Vittova Pro, which is not available yet.'}
          </p>
          <Link to="/pro" className="v-press v-btn-primary mt-5 inline-flex px-5">
            What's planned for Pro
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </div>
  );
}
