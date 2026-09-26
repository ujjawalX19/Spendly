import { History, Compass } from 'lucide-react';
import { Reveal, SectionHeading } from './shared';

const PAST = [
  ['Swiggy', 'Food', '₹320'],
  ['Metro card', 'Transport', '₹200'],
  ['Netflix', 'Bills', '₹199'],
  ['Groceries', 'Food', '₹640'],
];

export default function WhyVittova() {
  return (
    <section id="why" className="px-4 py-20 sm:px-6 lg:py-28">
      <div className="mx-auto max-w-6xl">
        <SectionHeading eyebrow="Why Vittova" title="Knowing what you spent is only half the answer.">
          A list of past payments can't tell you whether this weekend's plan fits. Vittova looks at what's left, what's due and how you usually spend, and answers the next question.
        </SectionHeading>

        <div className="mt-12 grid gap-4 md:grid-cols-2">
          <Reveal className="rounded-3xl border border-white/[0.06] bg-white/[0.02] p-6">
            <p className="flex items-center gap-2 text-sm font-bold text-zinc-400"><History className="h-4 w-4" aria-hidden="true" /> A typical expense list</p>
            <p className="mt-2 text-xl font-bold text-zinc-300">&ldquo;Here&apos;s where your money went.&rdquo;</p>
            <ul className="mt-5 divide-y divide-white/5 opacity-70">
              {PAST.map(([n, c, a]) => (
                <li key={n} className="flex items-center justify-between py-2.5 text-sm">
                  <span><span className="text-zinc-200">{n}</span> <span className="text-zinc-500">· {c}</span></span>
                  <span className="font-mono-finance text-zinc-300">−{a}</span>
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal delay={120} className="rounded-3xl border border-lime-400/25 bg-lime-400/[0.04] p-6">
            <p className="flex items-center gap-2 text-sm font-bold text-lime-300"><Compass className="h-4 w-4" aria-hidden="true" /> Vittova</p>
            <p className="mt-2 text-xl font-bold text-white">&ldquo;Here&apos;s what you can safely do next.&rdquo;</p>
            <ul className="mt-5 space-y-3 text-sm">
              <li className="flex items-center justify-between rounded-xl bg-black/30 px-3.5 py-3"><span className="text-zinc-300">Safe to spend today</span><span className="font-mono-finance font-bold text-lime-300">₹610</span></li>
              <li className="flex items-center justify-between rounded-xl bg-black/30 px-3.5 py-3"><span className="text-zinc-300">₹2,499 headphones</span><span className="font-bold text-amber-300">! Wait 6 days</span></li>
              <li className="flex items-center justify-between rounded-xl bg-black/30 px-3.5 py-3"><span className="text-zinc-300">Rent share due</span><span className="font-mono-finance text-zinc-200">in 5 days</span></li>
            </ul>
            <p className="mt-4 text-[11px] text-zinc-500">Illustration. Your figures come from your own records.</p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
