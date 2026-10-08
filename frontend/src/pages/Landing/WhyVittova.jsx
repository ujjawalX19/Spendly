import { Compass, Gauge, MessageCircle, Repeat } from 'lucide-react';
import AffordDemo from './AffordDemo';
import { Reveal, SectionHeading, WRAP } from './shared';

// What a visitor should take away, in the order the app delivers it.
const PILLARS = [
  { icon: Compass, title: 'Understand your spending', body: 'Every expense in one place, by category and by day, however it was added.' },
  { icon: Gauge, title: 'Know what is safe to spend', body: 'One figure for today, after the bills still due and the savings you set aside.' },
  { icon: MessageCircle, title: 'Get guidance from your own numbers', body: 'Ask in plain words. Answers start from your budget, bills and spending, not guesses.' },
  { icon: Repeat, title: 'Build better money habits', body: 'A daily mission, a streak and short challenges that reward spending less, never more.' },
];

export default function WhyVittova() {
  return (
    <section id="why" className="scroll-mt-20 border-t border-line py-20 lg:py-28">
      <div className={`${WRAP} grid items-start gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16`}>
        <div>
          <SectionHeading eyebrow="Why Vittova" title="Knowing what you spent is only half the answer.">
            A list of past payments cannot tell you whether this weekend&apos;s plan fits. Vittova looks at what is left, what is due and how you usually spend, then answers the next question.
          </SectionHeading>
          <ul className="mt-10 grid gap-x-8 gap-y-7 sm:grid-cols-2">
            {PILLARS.map((p, i) => (
              <Reveal as="li" key={p.title} delay={(i % 2) * 80}>
                <p.icon className="h-5 w-5 text-ink" strokeWidth={1.75} aria-hidden="true" />
                <h3 className="mt-3 text-base font-semibold text-ink">{p.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-ink-2">{p.body}</p>
              </Reveal>
            ))}
          </ul>
        </div>
        <Reveal delay={120} className="lg:sticky lg:top-24">
          <p className="mb-3 text-center text-sm font-medium text-ink-2">Try it: change the price</p>
          <AffordDemo />
        </Reveal>
      </div>
    </section>
  );
}
