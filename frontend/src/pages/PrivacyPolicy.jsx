import { Link } from 'react-router-dom';
import { SUPPORTED_PAYMENT_APPS } from '../lib/supportedPaymentApps';
import { SUPPORT_EMAIL, POLICY_LAST_UPDATED } from '../lib/legal';

/**
 * Privacy Policy.
 *
 * Every statement here must match the code. When a data flow changes, update
 * this page and PRIVACY_DATA_INVENTORY.md in the same change. Do not add
 * claims (encryption standards, AI training, certifications) that have not
 * been verified.
 */

function Section({ title, children }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-bold text-white">{title}</h2>
      {children}
    </section>
  );
}

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-[#09090b] px-6 py-12 text-zinc-300">
      <div className="mx-auto max-w-3xl">
        <Link to="/" className="text-sm text-zinc-500 hover:text-zinc-300">← Vittova</Link>
        <h1 className="mt-6 text-3xl font-black text-white">Privacy Policy</h1>
        <p className="mt-2 text-sm text-zinc-500">Last updated: {POLICY_LAST_UPDATED}</p>

        <div className="mt-8 space-y-8 text-sm leading-7">
          <p>
            This policy explains what information the Vittova Android app and web app collect, why, who processes it, how long
            it is kept, and how to delete it. Vittova is an expense tracker. It does not move money, connect to your bank
            account, or sell your data.
          </p>

          <Section title="1. Information you give us">
            <ul className="list-disc space-y-1 pl-5">
              <li><strong className="text-zinc-100">Account:</strong> your email address and name. If you sign in with Google, we receive your name and email address from Google. Passwords are handled by our authentication provider and are never visible to us.</li>
              <li><strong className="text-zinc-100">Expenses:</strong> amount, category, description, date, and how it was added (manual, receipt scan, payment notification, or statement import).</li>
              <li><strong className="text-zinc-100">Budget settings:</strong> monthly budget, savings target, and recurring bills you add.</li>
              <li><strong className="text-zinc-100">Coach conversations:</strong> the questions you ask the money coach and its answers.</li>
            </ul>
          </Section>

          <Section title="2. Information created while you use Vittova">
            <ul className="list-disc space-y-1 pl-5">
              <li>Round-up totals, logging streaks, weekly Spend Score history and statement-import history (bank name, number of transactions, statement period).</li>
              <li>Usage counters for free-plan limits (for example, coach questions asked today).</li>
              <li>Basic server logs needed to run and secure the service, such as request time and error type. Logs do not contain expense amounts, descriptions or notification text.</li>
            </ul>
            <p>We do not use advertising IDs, analytics or crash-reporting SDKs, or location data, and we do not show ads.</p>
          </Section>

          <Section title="3. Payment notifications (Android, optional)">
            <p>
              If you turn on Android <strong className="text-zinc-100">Notification Access</strong> for Vittova, the app can
              detect payments from these supported apps only:
            </p>
            <p className="rounded-xl border border-white/10 bg-white/[.03] p-3 text-xs leading-6 text-zinc-400">
              {SUPPORTED_PAYMENT_APPS.map((a) => a.name).join(', ')}.
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Notifications from every other app (for example WhatsApp, SMS/messages, email and social apps) are ignored and not read.</li>
              <li>A supported notification is analysed on your phone. If it describes a completed payment, Vittova keeps only the amount, payee name, app name, time and payment type in a private queue on your device for up to 7 days. The notification text itself is not saved or uploaded.</li>
              <li>Nothing is sent to our servers unless you tap <em>Add expense</em>. Only then are the amount, payee name and time saved to your account as an expense.</li>
              <li>Vittova does not request SMS permission and does not read SMS.</li>
              <li>You can turn Notification Access off at any time in Android settings.</li>
            </ul>
          </Section>

          <Section title="4. AI features and Google Gemini">
            <p>Some features send content to Google's Gemini API, operated by Google LLC, to generate a result:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li><strong className="text-zinc-100">Receipt scan:</strong> the receipt photo you choose. We save the merchant name, item list and total; we do not store the photo.</li>
              <li><strong className="text-zinc-100">Money coach:</strong> your question and a summary of your spending figures (for example monthly totals by category, budget and upcoming bills). Your name and email are not included.</li>
              <li><strong className="text-zinc-100">Spending tip:</strong> when you are projected to exceed your budget, your budget, amount spent and top spending category.</li>
              <li><strong className="text-zinc-100">Bank statement import</strong> (when available): the text of the PDF you upload. The file is processed in memory and not stored; the extracted transactions are saved.</li>
            </ul>
            <p>
              Google processes this content under the{' '}
              <a className="text-lime-400 underline" href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noreferrer">Gemini API Terms of Service</a>,
              which describe how long Google may retain it and how Google may use it. AI output can be wrong. Please check amounts before relying on them.
            </p>
          </Section>

          <Section title="5. How we use information">
            <ul className="list-disc space-y-1 pl-5">
              <li>To provide the app: show your spending, budget, forecasts and score, and answer your questions.</li>
              <li>To enforce free-plan limits and prevent abuse (for example rate limiting).</li>
              <li>To keep the service secure and fix problems.</li>
            </ul>
            <p>We do not sell or rent personal data, and we do not use your financial data for advertising.</p>
          </Section>

          <Section title="6. Service providers">
            <ul className="list-disc space-y-1 pl-5">
              <li><strong className="text-zinc-100">Supabase:</strong> authentication and database hosting.</li>
              <li><strong className="text-zinc-100">Render:</strong> hosting for the Vittova API server.</li>
              <li><strong className="text-zinc-100">Vercel:</strong> hosting for the Vittova website.</li>
              <li><strong className="text-zinc-100">Google:</strong> Google Sign-In (if you choose it) and the Gemini API (section 4).</li>
            </ul>
            <p>These providers process data on our behalf and may store it on servers outside India.</p>
            <p>Vittova does not currently offer in-app purchases or subscriptions, and does not send push notifications.</p>
          </Section>

          <Section title="7. Security">
            <p>
              Data is sent over encrypted HTTPS connections. Database access rules allow each account to read only its own
              records, and all changes go through our server. The Android app excludes your sign-in session from device backups.
              No system is perfectly secure; if we become aware of a breach affecting your data we will notify you as required by law.
            </p>
          </Section>

          <Section title="8. Stored on your device">
            <p>
              The app stores your sign-in session, whether you have completed onboarding, your choice about notification access,
              and the pending payment queue described in section 3. Signing out removes the session and these app preferences from the device.
            </p>
          </Section>

          <Section title="9. Retention">
            <ul className="list-disc space-y-1 pl-5">
              <li>Account and expense data: kept until you delete it or delete your account.</li>
              <li>Pending payment detections on your device: until you add or dismiss them, and at most 7 days.</li>
              <li>Server logs: kept for a limited period for security and debugging.</li>
              <li>Database backups kept by our hosting provider may contain deleted data until they expire on their normal schedule.</li>
            </ul>
          </Section>

          <Section title="10. Your choices and rights">
            <ul className="list-disc space-y-1 pl-5">
              <li><strong className="text-zinc-100">Access and portability:</strong> export your expenses as a CSV file from Settings.</li>
              <li><strong className="text-zinc-100">Correction:</strong> edit or delete any expense in the app.</li>
              <li><strong className="text-zinc-100">Deletion:</strong> delete your account in Settings → Delete account, or follow the steps at <Link to="/delete-account" className="text-lime-400 underline">Vittova account deletion</Link>. Deleting your account removes your login, profile, expenses, bills, score and streak history, import history and coach conversations, and the group pools you created.</li>
              <li><strong className="text-zinc-100">Withdraw consent:</strong> turn off Notification Access in Android settings, or stop using AI features.</li>
            </ul>
            <p>To exercise any right or raise a grievance, email <a className="text-lime-400 underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</p>
          </Section>

          <Section title="11. Children">
            <p>Vittova is intended for people aged 18 and over. We do not knowingly collect data from children. If you believe a child has created an account, contact us and we will delete it.</p>
          </Section>

          <Section title="12. Not financial advice">
            <p>Vittova provides expense tracking and general financial education. It does not recommend any security, fund, broker or platform and is not a SEBI-registered investment adviser.</p>
          </Section>

          <Section title="13. Changes">
            <p>If we change this policy we will update the date above and, for significant changes, tell you in the app before they take effect.</p>
          </Section>

          <Section title="14. Contact">
            <p><a className="text-lime-400 underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a></p>
          </Section>
        </div>
      </div>
    </div>
  );
}
