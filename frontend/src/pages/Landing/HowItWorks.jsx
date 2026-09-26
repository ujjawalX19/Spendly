import { PenLine, LineChart, Signpost } from 'lucide-react';
import { Reveal, SectionHeading } from './shared';

const STEPS = [
  { n: '01', icon: PenLine, title: 'Track', body: 'Add an expense in a few taps, scan a receipt, import a bank statement PDF, or confirm payments Vittova spots from your UPI and bank apps.' },
  { n: '02', icon: LineChart, title: 'Understand', body: 'Vittova puts your budget, bills still due, savings target and spending pace together into one picture of your month.' },
  { n: '03', icon: Signpost, title: 'Decide', body: 'Get straight answers: what you can spend today, whether a purchase fits, and how much could go to savings this month.' },
];

export default function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-20 border-y border-white/[0.06] bg-white/[0.015] px-4 py-20 sm:px-6 lg:py-28">
      <div className="mx-auto max-w-6xl">
        <SectionHeading eyebrow="How it works" title="Spend. Understand. Decide." center />
        <ol className="mt-12 grid gap-4 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <Reveal as="li" key={s.n} delay={i * 110} className="relative rounded-3xl border border-white/[0.06] bg-[#0f1012] p-6">
              <div className="flex items-center justify-between">
                <span className="font-mono-finance text-sm font-bold text-lime-400">{s.n}</span>
                <s.icon className="h-5 w-5 text-zinc-500" aria-hidden="true" />
              </div>
              <h3 className="mt-6 text-xl font-bold text-white">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">{s.body}</p>
              {i < STEPS.length - 1 && <span aria-hidden="true" className="absolute -right-3 top-1/2 hidden h-px w-6 bg-lime-400/40 md:block" />}
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
