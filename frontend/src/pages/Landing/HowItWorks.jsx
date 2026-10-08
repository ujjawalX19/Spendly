import { Reveal, SectionHeading, WRAP } from './shared';

const STEPS = [
  { n: '1', title: 'Track', body: 'Add an expense in a few taps, scan a receipt, import a bank statement PDF, or let Vittova add payments automatically from your UPI and bank alerts on Android.' },
  { n: '2', title: 'Understand', body: 'Vittova puts your budget, bills still due, savings target and spending pace together into one picture of your month.' },
  { n: '3', title: 'Decide', body: 'Get straight answers: what you can spend today, whether a purchase fits, and how much could go to savings this month.' },
];

export default function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-20 border-t border-line py-20 lg:py-28">
      <div className={WRAP}>
        <SectionHeading eyebrow="How it works" title="Track. Understand. Decide." />
        <ol className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
          {STEPS.map((s, i) => (
            <Reveal as="li" key={s.n} delay={i * 90} className="border-t border-line-strong pt-5">
              <span className="text-sm font-medium tabular-nums text-ink-3">Step {s.n}</span>
              <h3 className="mt-2 text-xl font-semibold tracking-[-0.015em] text-ink">{s.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{s.body}</p>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
