import { Award, CalendarRange, Download, Gauge, Repeat, Users } from 'lucide-react';
import AiSection from './AiSection';
import { ActivityMock, HabitMock, WealthMock } from './Mocks';
import { Reveal, SectionHeading, Split, WRAP } from './shared';

// The rest of the app, one line each. Pro-only tools say so.
const MORE = [
  { icon: Gauge, title: 'Burn Rate', body: "An early warning when you're on pace to finish the month over budget." },
  { icon: CalendarRange, title: 'Month Shape', body: 'Where your month is heading, from your pace and the bills still to come.' },
  { icon: Award, title: 'Spend Score', body: 'How steady your spending is week to week, and what moved it.' },
  { icon: Users, title: 'Group Pool', body: 'Split shared bills with an invite code, see who owes whom and record settle-ups.' },
  { icon: Repeat, title: 'Subscription leak audit', body: 'Every recurring payment and what it costs a year, with a reminder the day before a debit.', pro: true },
  { icon: Download, title: 'Your data, exportable', body: 'Download all your expenses as a CSV file from your profile at any time.' },
];

export default function Features() {
  return (
    <section id="features" className="scroll-mt-20 border-t border-line py-20 lg:py-28">
      <div className={WRAP}>
        <SectionHeading eyebrow="Product" title="Built around the questions you actually ask.">
          Every screen answers something: where did it go, can I buy this, where is my month heading, how much can I set aside.
        </SectionHeading>

        <div className="mt-16 space-y-20 lg:mt-20 lg:space-y-28">
          <Split
            eyebrow="Expense tracking"
            title="Every expense, without the typing."
            body="Add a spend in a few taps, or let Vittova do it. Each entry shows its category and how it got there, grouped by day with a total."
            points={[
              'Scan a receipt and the amount is filled in for you',
              'Import a bank statement PDF',
              'On Android, payments from supported UPI apps and bank alerts are added automatically, only after you allow it',
            ]}
          >
            <ActivityMock />
          </Split>

          <Split
            flip
            eyebrow="Plan and invest"
            title="See what your month can spare before you commit."
            body="Safe-to-Invest shows what this month doesn't need after spending, bills and savings. The SIP stress test checks whether a monthly amount fits a typical month."
            points={[
              'A cash-flow figure, not a product pick',
              'Education only: no fund, stock, broker or platform is recommended',
              'Illustrations use assumed rates and are not predictions',
            ]}
          >
            <WealthMock />
          </Split>

          <AiSection />

          <Split
            flip
            eyebrow="Money Streak and Save-to-Earn"
            title="Small missions that make the habit stick."
            body="A daily mission and a streak for logging honestly and staying within your plan, plus short challenges such as a week without food delivery."
            points={[
              'XP rewards logging and staying within your plan. Spending more never earns XP',
              'The Victory Pot is an estimate of spending avoided. It is not cash and cannot be withdrawn',
            ]}
          >
            <HabitMock />
          </Split>
        </div>

        <Reveal className="mt-20 lg:mt-28">
          <h3 className="text-xl font-semibold tracking-[-0.015em] text-ink">Also in Vittova</h3>
          <ul className="mt-6 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
            {MORE.map((f) => (
              <li key={f.title} className="bg-surface p-5 sm:p-6">
                <f.icon className="h-5 w-5 text-ink" strokeWidth={1.75} aria-hidden="true" />
                <p className="mt-3 flex items-center gap-2 text-[15px] font-semibold text-ink">
                  {f.title}
                  {f.pro && <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-ink-2">Pro</span>}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-ink-2">{f.body}</p>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
