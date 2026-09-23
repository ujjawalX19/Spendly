import { SUPPORT_EMAIL } from '../lib/legal';
/**
 * TermsOfService.jsx
 * ─────────────────────────────────────────────────────────────
 * Full Terms of Service for Play Store compliance.
 */
export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-black text-white p-6 max-w-2xl mx-auto pb-28">
      <h1 className="text-3xl font-black mb-2">Terms of Service</h1>
      <p className="text-zinc-400 mb-8">Last updated: 23 September 2026</p>

      <div className="space-y-8 text-sm text-zinc-300 leading-relaxed">
        <section>
          <h2 className="text-lg font-bold text-white mb-2">1. Acceptance of Terms</h2>
          <p>
            By using Vittova, you agree to these Terms of Service. If you do not agree, please do not use the app. We reserve the right to modify these terms at any time, with notification provided through the app.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white mb-2">2. Not Financial Advice</h2>
          <p>
            Vittova provides financial education, expense tracking, and spending pattern recognition.{' '}
            <strong className="text-amber-400">We are not a SEBI-registered financial advisor, bank, NBFC, or any regulated financial entity.</strong>{' '}
            Any compounding illustrations use assumed rates chosen for illustration; they are not forecasts, and real investments can lose value. Vittova is not a SEBI-registered investment adviser and does not recommend any security, fund, broker or platform. Consider consulting a SEBI-registered investment adviser before making investment decisions.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white mb-2">3. User Accounts</h2>
          <p>
            You are responsible for maintaining the confidentiality of your account credentials. You are responsible for all activities that occur under your account. You must provide accurate information when creating your account.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white mb-2">4. Vittova Pro</h2>
          <p>
            Vittova Pro is not yet available and cannot be purchased. No subscription or payment is taken through the app. If paid plans are introduced, their price, billing and cancellation terms will be shown before purchase and these terms will be updated.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white mb-2">5. Free plan limits</h2>
          <p>
            The free plan includes daily and monthly limits (for example on money-coach questions and receipt scans) and rate limits that protect the service. Limits are shown in the app and may change with notice.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white mb-2">6. Acceptable Use</h2>
          <p>You agree not to:</p>
          <ul className="list-disc pl-5 mt-2 space-y-1 text-zinc-400">
            <li>Store sensitive data unrelated to expense tracking (credit card numbers, passwords, government IDs)</li>
            <li>Use the app for illegal purposes or money laundering</li>
            <li>Attempt to reverse-engineer, hack, or abuse the service</li>
            <li>Upload malicious files or attempt to exploit the PDF import feature</li>
            <li>Create multiple accounts to circumvent free-tier limits</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white mb-2">7. Data Accuracy</h2>
          <p>
            While we strive for accuracy in AI-powered features (receipt scanning, transaction categorization, subscription detection), automated processing may occasionally produce errors. You are responsible for verifying the accuracy of imported and categorized data.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white mb-2">8. Limitation of Liability</h2>
          <p>
            Vittova is provided "as is" without warranties of any kind. To the extent permitted by applicable law, we are not liable for any financial losses resulting from reliance on the app's features, projections, or AI-generated suggestions. Nothing in these terms limits any liability that cannot be limited under the laws of India.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white mb-2">9. Account Termination</h2>
          <p>
            We reserve the right to suspend or terminate accounts that violate these terms. You may delete your account at any time from Settings or by following the steps on the account deletion page. Deletion is permanent; see the Privacy Policy for what is removed and what backups may temporarily retain.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white mb-2">10. Governing Law</h2>
          <p>
            These terms are governed by the laws of India. Any disputes shall be subject to the exclusive jurisdiction of the courts in New Delhi, India.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white mb-2">11. Contact</h2>
          <p>
            For questions about these terms, contact us at:{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-lime-400 underline">{SUPPORT_EMAIL}</a>
          </p>
        </section>
      </div>
    </div>
  );
}
