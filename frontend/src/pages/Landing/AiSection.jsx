import { MessageCircle } from 'lucide-react';
import { Reveal, SectionHeading } from './shared';

export default function AiSection() {
  return (
    <section id="ai" className="scroll-mt-20 border-y border-white/[0.06] bg-white/[0.015] px-4 py-20 sm:px-6 lg:py-28">
      <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2">
        <div>
          <SectionHeading eyebrow="Ask Vittova" title="An AI mentor that starts from your numbers.">
            Ask in plain words. Vittova works out the figures from your own budget, spending and bills first, then explains them. It says when something isn&apos;t tracked instead of guessing.
          </SectionHeading>
          <Reveal as="ul" className="mt-6 space-y-2 text-sm text-zinc-300">
            <li>✓ Figures come from Vittova&apos;s own calculations, not the AI&apos;s imagination</li>
            <li>✓ Your name and email are never sent to the AI</li>
            <li>✓ General education: no stock or fund recommendations</li>
          </Reveal>
        </div>

        <Reveal delay={120} className="rounded-[28px] border border-white/10 bg-[#0c0d0f] p-5" aria-label="Example conversation">
          <p className="flex items-center gap-2 text-sm font-bold text-white"><MessageCircle className="h-4 w-4 text-lime-300" aria-hidden="true" /> Ask Vittova <span className="ml-auto rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400">Example</span></p>
          <div className="mt-5 flex justify-end">
            <p className="max-w-[80%] rounded-2xl rounded-br-md bg-lime-400 px-4 py-2.5 text-sm font-medium text-black">Can I spend ₹3,000 this weekend?</p>
          </div>
          <div className="mt-3 max-w-[92%] rounded-2xl rounded-bl-md border border-white/10 bg-zinc-900 px-4 py-3 text-sm leading-relaxed text-zinc-200">
            <p className="font-semibold text-white">You can, but it squeezes the rest of your month.</p>
            <p className="mt-2">You have <b className="text-white">₹420 a day</b> for the next 12 days, after setting aside the <b className="text-white">₹2,000</b> bill due in 4 days. Spending ₹3,000 now would leave about <b className="text-white">₹170 a day</b>.</p>
          </div>
          <p className="mt-4 text-[11px] text-zinc-500">An illustration of the answer format. In the app, every number comes from your own data.</p>
        </Reveal>
      </div>
    </section>
  );
}
