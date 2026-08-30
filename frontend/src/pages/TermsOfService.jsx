/**
 * TermsOfService.jsx
 * ─────────────────────────────────────────────────────────────
 * Full Terms of Service for Play Store compliance.
 */
export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-black text-white p-6 max-w-2xl mx-auto pb-28">
      <h1 className="text-3xl font-black mb-2">Terms of Service</h1>
      <p className="text-zinc-400 mb-8">Last updated: August 2026</p>

      <div className="space-y-8 text-sm text-zinc-300 leading-relaxed">
        <section>
          <h2 className="text-lg font-bold text-white mb-2">1. Acceptance of Terms</h2>
          <p>
            By using Spendly, you agree to these Terms of Service. If you do not agree, please do not use the app. We reserve the right to modify these terms at any time, with notification provided through the app.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white mb-2">2. Not Financial Advice</h2>
          <p>
            Spendly provides financial education, expense tracking, and spending pattern recognition.{' '}
            <strong className="text-amber-400">We are not a SEBI-registered financial advisor, bank, NBFC, or any regulated financial entity.</strong>{' '}
            Any investment projections shown are based on historical averages and do not guarantee future returns. Always consult a certified financial advisor before making investment decisions.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white mb-2">3. User Accounts</h2>
          <p>
            You are responsible for maintaining the confidentiality of your account credentials. You are responsible for all activities that occur under your account. You must provide accurate information when creating your account.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white mb-2">4. Spendly Pro Subscriptions</h2>
          <p>
            Spendly Pro is an auto-renewing monthly subscription at ₹99/month, managed through Google Play Billing. Subscriptions automatically renew unless cancelled at least 24 hours before the end of the current billing period. You can cancel at any time through your Google Play account settings. Refunds are subject to Google Play's refund policy.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white mb-2">5. In-App Purchases</h2>
          <p>
            Streak Freezes and other consumable purchases are non-refundable once used. All purchases are processed through Google Play Billing and are subject to Google's purchase policies.
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
            Spendly is provided "as is" without warranties of any kind. We are not liable for any financial losses resulting from reliance on the app's features, projections, or AI-generated suggestions. Our total liability shall not exceed the amount you paid for Spendly Pro in the preceding 12 months.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white mb-2">9. Account Termination</h2>
          <p>
            We reserve the right to suspend or terminate accounts that violate these terms. You may delete your account at any time from Settings. Upon deletion, all your data is permanently removed and cannot be recovered.
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
            <a href="mailto:support@spendly.app" className="text-lime-400 underline">support@spendly.app</a>
          </p>
        </section>
      </div>
    </div>
  );
}
