import { AlertTriangle } from 'lucide-react';

/**
 * SEBI-compliant investment disclaimer.
 * Must appear on EVERY investment-related screen.
 *
 * Play Store compliance:
 *   ✅ Must add disclaimer: "This app provides financial education only..."
 *   ✅ Must declare in Play Store listing that app contains financial content
 *   ✅ Do NOT use: "guaranteed returns", "best investment", "safe returns"
 *   ✅ DO use: "historical average", "potential growth", "educational purposes"
 */
export default function InvestmentDisclaimer({ compact = false }) {
  if (compact) {
    return (
      <p className="text-[10px] text-zinc-500 mt-3 leading-relaxed">
        ⚠️ Financial education only — not SEBI-regulated advice. Consult a certified advisor before investing.
      </p>
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 mt-4">
      <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
      <div className="text-xs text-zinc-400 leading-relaxed">
        <p className="font-bold text-amber-400 mb-1">Investment Disclaimer</p>
        <p>
          This app provides financial education and expense tracking only. Investment content is for
          awareness purposes and does not constitute SEBI-regulated financial advice. Past performance
          and historical averages are not indicative of future results. Please consult a certified
          financial advisor before making investment decisions.
        </p>
        <p className="mt-1.5 text-zinc-500">
          Not affiliated with any bank, SEBI-registered entity, or credit bureau.
        </p>
      </div>
    </div>
  );
}
