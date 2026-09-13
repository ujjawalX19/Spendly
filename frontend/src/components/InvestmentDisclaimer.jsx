import { AlertTriangle } from 'lucide-react';

/**
 * Education disclaimer for any screen that discusses saving or investing.
 *
 * Wording is deliberately factual. Do not claim Spendly is "SEBI-compliant":
 * that has not been professionally verified (see FINANCIAL_CONTENT_REVIEW.md).
 */
export default function InvestmentDisclaimer({ compact = false }) {
  if (compact) {
    return (
      <p className="text-[10px] text-zinc-500 mt-3 leading-relaxed">
        General financial education, not investment advice. Spendly is not a SEBI-registered investment adviser.
      </p>
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 mt-4">
      <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
      <div className="text-xs text-zinc-400 leading-relaxed">
        <p className="font-bold text-amber-400 mb-1">Not investment advice</p>
        <p>
          Spendly tracks spending and offers general financial education. It does not recommend any
          security, fund, or platform, and it is not a SEBI-registered investment adviser. Investments
          can lose value; illustrations use assumed rates, not predictions. Consider speaking to a
          SEBI-registered investment adviser before investing.
        </p>
        <p className="mt-1.5 text-zinc-500">
          Not affiliated with any bank, broker, fund house, or credit bureau.
        </p>
      </div>
    </div>
  );
}
