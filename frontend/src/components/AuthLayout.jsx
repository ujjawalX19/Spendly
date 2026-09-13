import { ArrowUpRight, CircleDollarSign, Sparkles } from 'lucide-react';

export default function AuthLayout({ children, eyebrow = 'YOUR MONEY, IN FLOW' }) {
    return (
        <main className="relative min-h-screen overflow-hidden bg-[#080a08] px-5 pt-12 pb-8 text-white sm:px-6 sm:py-8">
            <div className="pointer-events-none absolute inset-0 opacity-40" style={{ backgroundImage: 'linear-gradient(rgba(163,230,53,.045) 1px, transparent 1px), linear-gradient(90deg, rgba(163,230,53,.045) 1px, transparent 1px)', backgroundSize: '44px 44px' }} />
            <div className="pointer-events-none absolute -left-24 top-12 h-72 w-72 rounded-full bg-lime-400/10 blur-[100px]" />
            <div className="pointer-events-none absolute -right-24 bottom-0 h-80 w-80 rounded-full bg-emerald-500/10 blur-[110px]" />

            <div className="relative mx-auto grid min-h-[calc(100vh-5rem)] max-w-6xl overflow-hidden rounded-[2rem] border border-white/10 bg-[#0d100d]/95 shadow-2xl shadow-black/50 grid-cols-1 lg:grid-cols-[1.08fr_.92fr] sm:min-h-[calc(100vh-4rem)]">
                <aside className="relative overflow-hidden border-b lg:border-b-0 lg:border-r border-white/10 bg-[#121713] p-6 lg:p-10 flex flex-col">
                    <div className="flex items-center gap-2.5 text-lg font-extrabold tracking-tight mb-8 lg:mb-0">
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-lime-400 text-black shadow-lg shadow-lime-400/20"><CircleDollarSign className="h-5 w-5" /></span>
                        Spendly
                    </div>
                    <div className="my-auto max-w-md">
                        <p className="mb-5 text-xs font-bold tracking-wider uppercase text-lime-300">{eyebrow}</p>
                        <h2 className="text-5xl font-extrabold leading-tight tracking-tight">A clearer view of every <span className="text-lime-400">rupee.</span></h2>
                        <p className="mt-5 max-w-sm text-sm leading-6 text-zinc-400">Track the everyday stuff, settle up with friends, and make your next money move with confidence.</p>

                        <div className="mt-10 rotate-[-3deg] rounded-3xl border border-lime-300/15 bg-[#1a211b] p-5 shadow-xl shadow-lime-950/30">
                            <div className="flex items-start justify-between">
                                <div><p className="text-xs text-zinc-400">This month&apos;s balance</p><p className="mt-1 text-3xl font-bold tracking-tight">₹24,860<span className="text-base text-zinc-500">.00</span></p></div>
                                <span className="rounded-xl bg-lime-400 p-2 text-black"><ArrowUpRight className="h-4 w-4" /></span>
                            </div>
                            <div className="mt-6 flex items-end gap-1.5">
                                {[36, 56, 42, 72, 48, 86, 68, 96].map((height, index) => <span key={index} style={{ height: `${height / 2}px` }} className="w-full rounded-t-sm bg-lime-400/20 last:bg-lime-400" />)}
                            </div>
                            <div className="mt-4 flex items-center gap-2 border-t border-white/5 pt-4 text-xs text-lime-300"><Sparkles className="h-3.5 w-3.5" /> You&apos;re spending 18% smarter this week</div>
                        </div>
                    </div>
                    <p className="mt-auto pt-4 text-xs text-zinc-500">Built for your everyday money moments.</p>
                </aside>
                <section className="flex items-center justify-center overflow-y-auto p-5 sm:p-10 lg:p-12">
                    <div className="w-full max-w-md mx-auto">{children}</div>
                </section>
            </div>
        </main>
    );
}
