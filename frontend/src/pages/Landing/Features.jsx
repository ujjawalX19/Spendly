import { Gauge, Award, ScanLine, ShoppingBag, Sprout, Users, Flame, CalendarRange } from 'lucide-react';
import { Reveal, SectionHeading } from './shared';

// Small visual under each card. Illustrative figures only.
function Bar({ pct, tone = 'bg-lime-400' }) {
  return <div className="h-1.5 overflow-hidden rounded-full bg-white/10"><div className={`l-grow h-full rounded-full ${tone}`} style={{ '--w': `${pct}%` }} /></div>;
}

const CARDS = [
  {
    icon: Gauge, title: 'Spend smarter',
    body: "Safe-to-Spend shows what's left per day after bills and savings. Burn Rate warns you early when you're on pace to overspend.",
    visual: (
      <div className="space-y-2">
        <div className="flex justify-between text-xs"><span className="text-zinc-400">Safe to spend</span><span className="font-mono-finance font-bold text-white">₹610/day</span></div>
        <Bar pct={62} />
        <p className="text-[11px] text-amber-300">! At this pace you'd finish ₹1,800 over</p>
      </div>
    ),
  },
  {
    icon: ShoppingBag, title: 'Think before you buy',
    body: 'Afford-It checks a purchase against your month, and says Comfortable, Wait or Too tight, with a safer date when it\'s tight.',
    visual: (
      <div className="flex items-center justify-between rounded-xl bg-black/30 px-3 py-2.5 text-xs">
        <span className="text-zinc-300">₹2,499 shoes</span><span className="font-bold text-lime-300">✓ Comfortable</span>
      </div>
    ),
  },
  {
    icon: CalendarRange, title: 'See the month ahead',
    body: 'Month Shape projects where your month is heading from your pace and the bills still to come, before it\'s too late to adjust.',
    visual: (
      <div className="flex h-10 items-end gap-1" aria-hidden="true">
        {[30, 45, 38, 52, 60, 48, 70, 64, 76, 82].map((h, i) => <span key={i} className="l-rise flex-1 rounded-sm bg-lime-400/70" style={{ '--h': `${h}%`, animationDelay: `${i * 40}ms` }} />)}
      </div>
    ),
  },
  {
    icon: Sprout, title: 'Plan to invest, without guessing',
    body: 'Safe-to-Invest shows what your month doesn\'t need. The SIP stress test checks whether a monthly amount fits. Education only, no fund or stock picks.',
    visual: (
      <div className="flex justify-between text-xs"><span className="text-zinc-400">₹1,500 SIP</span><span className="font-bold text-lime-300">Fits your month</span></div>
    ),
  },
  {
    icon: Award, title: 'Know your money',
    body: 'Your Spend Score shows how steady your spending is week to week, and what moved it.',
    visual: (
      <div className="flex items-center gap-3">
        <span className="font-mono-finance text-2xl font-black text-white">74</span>
        <div className="flex-1"><Bar pct={74} /></div>
      </div>
    ),
  },
  {
    icon: ScanLine, title: 'Scan and track',
    body: 'Snap a receipt, import a bank statement PDF, or confirm payments Vittova spots from supported UPI and bank apps on Android.',
    visual: (
      <div className="flex gap-2 text-[11px] font-semibold text-zinc-300">
        {['Receipt', 'PDF', 'UPI'].map((x) => <span key={x} className="rounded-full border border-white/10 px-2.5 py-1">{x}</span>)}
      </div>
    ),
  },
  {
    icon: Users, title: 'Money with friends',
    body: 'Group Pool splits shared bills with an invite code, shows who owes whom and records settle-ups.',
    visual: (
      <div className="flex items-center justify-between text-xs"><span className="text-zinc-400">Trip · 4 people</span><span className="font-bold text-white">You get back ₹840</span></div>
    ),
  },
  {
    icon: Flame, title: 'Keep the habit',
    body: 'Money Streak turns logging and staying under your daily limit into a streak. It never rewards spending more.',
    visual: (
      <div className="flex gap-1.5" aria-hidden="true">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={i} className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-black ${i < 5 ? 'bg-orange-500 text-black' : 'bg-white/10 text-zinc-500'}`}>{i < 5 ? '✓' : d}</span>)}
      </div>
    ),
  },
];

export default function Features() {
  return (
    <section id="features" className="scroll-mt-20 px-4 py-20 sm:px-6 lg:py-28">
      <div className="mx-auto max-w-6xl">
        <SectionHeading eyebrow="Features" title="Built around the questions you actually ask.">
          Every screen answers something: can I spend, can I buy this, where is my month heading, how much can I save.
        </SectionHeading>
        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CARDS.map((c, i) => (
            <Reveal as="li" key={c.title} delay={(i % 4) * 80} className="l-card flex flex-col rounded-3xl border border-white/[0.06] bg-[#0f1012] p-5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-lime-400/10"><c.icon className="h-5 w-5 text-lime-300" aria-hidden="true" /></span>
              <h3 className="mt-4 text-base font-bold text-white">{c.title}</h3>
              <p className="mt-1.5 flex-1 text-sm leading-relaxed text-zinc-400">{c.body}</p>
              <div className="mt-5 rounded-2xl border border-white/[0.06] bg-black/30 p-3">{c.visual}</div>
            </Reveal>
          ))}
        </ul>
        <p className="mt-4 text-center text-[11px] text-zinc-500">Figures in these cards are illustrations.</p>
      </div>
    </section>
  );
}
