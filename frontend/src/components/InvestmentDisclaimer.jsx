/**
 * Education disclaimer for any screen that discusses saving or investing.
 *
 * Wording is deliberately factual. Do not claim Vittova is "SEBI-compliant":
 * that has not been professionally verified (see FINANCIAL_CONTENT_REVIEW.md).
 */
export default function InvestmentDisclaimer({ compact = false }) {
  if (compact) {
    return (
      <p className="mt-3 text-[11px] leading-relaxed text-ink-3">
        General financial education, not investment advice. Vittova is not a SEBI-registered investment adviser.
      </p>
    );
  }

  return (
    <div className="mt-4 border-t border-line pt-4 text-xs leading-relaxed text-ink-3">
      <p className="mb-1 font-semibold text-ink-2">Not investment advice</p>
      <p>
        Vittova tracks spending and offers general financial education. It does not recommend any
        security, fund, or platform, and it is not a SEBI-registered investment adviser. Investments
        can lose value; illustrations use assumed rates, not predictions. Consider speaking to a
        SEBI-registered investment adviser before investing.
      </p>
      <p className="mt-1.5">
        Not affiliated with any bank, broker, fund house, or credit bureau.
      </p>
    </div>
  );
}
