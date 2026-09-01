/**
 * PrivacyPolicy.jsx
 * ─────────────────────────────────────────────────────────────
 * Full privacy policy compliant with Google Play Store Data Safety
 * requirements. Must cover: data collection, AI processing,
 * third-party services, data deletion, children, and contact info.
 */
export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-black text-white p-6 max-w-2xl mx-auto pb-28">
      <h1 className="text-3xl font-black mb-2">Privacy Policy</h1>
      <p className="text-zinc-400 mb-8">Last updated: August 2026</p>

      <div className="space-y-8 text-sm text-zinc-300 leading-relaxed">
        <section>
          <h2 className="text-lg font-bold text-white mb-2">1. Data We Collect</h2>
          <p>Spendly collects the minimum data required to provide expense tracking services:</p>
          <ul className="list-disc pl-5 mt-2 space-y-1 text-zinc-400">
            <li><strong className="text-zinc-200">Account info:</strong> Email address and display name (via Supabase Auth or Google Sign-In).</li>
            <li><strong className="text-zinc-200">Expense records:</strong> Amounts, categories, descriptions, and timestamps that you manually enter or import.</li>
            <li><strong className="text-zinc-200">Receipt images:</strong> Photos you upload for AI scanning. Processed in memory, never stored permanently.</li>
            <li><strong className="text-zinc-200">Device info:</strong> Push notification tokens (if you enable notifications). We do not collect device IDs, advertising IDs, or location data.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white mb-2">2. PDF Processing & AI</h2>
          <p>
            When you upload a bank statement PDF, it is processed temporarily on our servers to extract transactions using Google Gemini AI.{' '}
            <strong className="text-lime-400">The PDF file is immediately deleted after processing and is never stored on our servers.</strong>{' '}
            We use Google Gemini AI for receipt scanning, transaction categorization, and financial insights. No personally identifiable financial data is used to train AI models.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white mb-2">3. How We Use Your Data</h2>
          <ul className="list-disc pl-5 space-y-1 text-zinc-400">
            <li>Calculate your Safe-to-Spend, Burn Rate, and Spend Score</li>
            <li>Detect recurring subscriptions and spending patterns</li>
            <li>Generate personalized financial education insights via AI</li>
            <li>Send push notifications (only if you opt in)</li>
            <li>Manage your Spendly Pro subscription</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white mb-2">4. Data Storage & Security</h2>
          <p>
            Your data is stored securely in Supabase (PostgreSQL) with Row-Level Security (RLS) enabled. Each user can only access their own data. All connections use TLS encryption. We follow industry-standard security practices to protect your information.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white mb-2">5. Third-Party Services</h2>
          <p>Spendly uses the following third-party services:</p>
          <ul className="list-disc pl-5 mt-2 space-y-1 text-zinc-400">
            <li><strong className="text-zinc-200">Supabase:</strong> Authentication and database hosting</li>
            <li><strong className="text-zinc-200">Google Gemini AI:</strong> Receipt scanning, transaction categorization, and financial education content</li>
            <li><strong className="text-zinc-200">Google Play Billing:</strong> Subscription management for Spendly Pro</li>
            <li><strong className="text-zinc-200">Render:</strong> Backend API hosting</li>
          </ul>
          <p className="mt-2">We do not use analytics SDKs, advertising networks, or social media trackers.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white mb-2">6. Data Sharing</h2>
          <p>
            <strong className="text-lime-400">We do not sell, rent, or trade your personal data to any third party.</strong>{' '}
            Your financial data is private. We only share data with the third-party services listed above, solely for the purpose of providing Spendly's features.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white mb-2">7. Account Deletion</h2>
          <p>
            You can permanently delete your account and all associated data at any time from <strong className="text-zinc-200">Settings → Delete Account</strong>. This action is irreversible and removes all your expenses, streak data, Spend Score history, group memberships, and profile information.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white mb-2">8. Children's Privacy</h2>
          <p>
            Spendly is not directed at children under 13. We do not knowingly collect personal information from children. If you are a parent or guardian and believe your child has provided us with personal data, please contact us and we will delete it promptly.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white mb-2">9. Changes to This Policy</h2>
          <p>
            We may update this privacy policy from time to time. We will notify you of any material changes through the app. Continued use of Spendly after changes constitutes acceptance of the updated policy.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white mb-2">10. Contact Us</h2>
          <p>
            If you have any questions about this privacy policy or your data, reach out to us at:{' '}
            <a href="mailto:support@spendly.app" className="text-lime-400 underline">support@spendly.app</a>
          </p>
        </section>
      </div>
    </div>
  );
}
