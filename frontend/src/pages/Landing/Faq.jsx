/**
 * Common questions. Every answer describes how Vittova works today (see
 * /privacy, /terms and the Pro notes in ProSection.jsx); keep them in step.
 * Native <details>, so it works with no JavaScript and with a keyboard.
 */
import { Plus } from 'lucide-react';
import { Reveal, SectionHeading, WRAP } from './shared';

const QUESTIONS = [
  {
    q: 'Is Vittova free?',
    a: 'Yes. Tracking, budgets, Safe-to-Spend, Money Streak and challenges are free, with daily limits on a few things such as Afford-It checks and Ask Vittova questions. Vittova Pro is optional and is not on sale yet.',
  },
  {
    q: 'Does Vittova connect to my bank account?',
    a: "No. Vittova never connects to your bank and never asks for a bank password. You add expenses yourself, scan a receipt or import a statement PDF. On Android you can also let Vittova read payment notifications and your bank's debit SMS to add payments for you; it is optional and only starts after you allow it.",
  },
  {
    q: 'Where do the numbers come from?',
    a: "From the budget, bills, savings target and expenses in your account. Vittova doesn't track your income or your bank balance, so every figure is about your budget, not your bank account.",
  },
  {
    q: 'Is this investment advice?',
    a: 'No. Vittova offers general financial education. It does not recommend any security, fund, broker or platform, and it is not a SEBI-registered investment adviser. Illustrations use assumed rates and are not predictions.',
  },
  {
    q: 'How will Pro be billed, and can I buy it on this website?',
    a: 'Pro will be sold only through Google Play in the Vittova Android app, billed to your Google account. It cannot be bought on this website. Google Play shows the price and renewal terms before you pay.',
  },
  {
    q: 'How do I cancel Pro or get a refund?',
    a: "You cancel in Google Play → Payments & subscriptions, and Pro stays on until the end of the period you paid for. Refunds are handled under Google Play's refund policies.",
  },
  {
    q: 'Can I export or delete my data?',
    a: "Yes. Export all your expenses as a CSV file from your profile, and delete your account and its data from the app. If you can't sign in, the Delete your account page explains how to ask us.",
  },
  {
    q: 'Which devices does Vittova work on?',
    a: 'There is an Android app and a web app, and one account works on both. Automatic payment tracking and debit reminders are Android only.',
  },
];

export default function Faq() {
  return (
    <section id="faq" className="scroll-mt-20 border-t border-line py-20 lg:py-28">
      <div className={`${WRAP} grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16`}>
        <SectionHeading eyebrow="FAQ" title="Questions, answered plainly.">
          Something else? Write to us from the <a href="/support" className="l-link">support page</a>.
        </SectionHeading>
        <Reveal className="v-rows border-y border-line">
          {QUESTIONS.map((item) => (
            <details key={item.q} className="group">
              <summary className="flex min-h-[60px] cursor-pointer list-none items-center justify-between gap-4 py-3 text-base font-medium text-ink [&::-webkit-details-marker]:hidden">
                {item.q}
                <Plus className="h-4 w-4 shrink-0 text-ink-2 transition-transform duration-200 group-open:rotate-45" aria-hidden="true" />
              </summary>
              <p className="pb-5 pr-8 text-[15px] leading-relaxed text-ink-2">{item.a}</p>
            </details>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
