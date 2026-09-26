import { Link } from 'react-router-dom';
import { Lock, BellOff, Trash2, Download, EyeOff, Mail } from 'lucide-react';
import { Reveal, SectionHeading } from './shared';
import { SUPPORT_EMAIL } from '../../lib/legal';

// Each point describes how Vittova actually works (see /privacy).
const POINTS = [
  { icon: Lock, title: 'Your data is yours alone', body: 'Each account can read only its own records, and every change goes through our server over HTTPS.' },
  { icon: BellOff, title: 'No bank password, no SMS', body: "Vittova never connects to your bank and doesn't ask for SMS access. Payment detection on Android is optional and reads only supported payment apps." },
  { icon: EyeOff, title: 'No ads, no selling data', body: "We don't show ads, sell your data or use your finances for advertising. The AI never receives your name or email." },
  { icon: Download, title: 'Export any time', body: 'Download all your expenses as a CSV file from your profile.' },
  { icon: Trash2, title: 'Delete in one place', body: 'Delete your account and data from the app, or follow the steps on our website if you can\'t sign in.' },
  { icon: Mail, title: 'Real support', body: `Questions or requests go to ${SUPPORT_EMAIL}.` },
];

export default function TrustSection() {
  return (
    <section id="trust" className="scroll-mt-20 border-t border-white/[0.06] px-4 py-20 sm:px-6 lg:py-28">
      <div className="mx-auto max-w-6xl">
        <SectionHeading eyebrow="Privacy and security" title="Built for money you care about." />
        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {POINTS.map((p, i) => (
            <Reveal as="li" key={p.title} delay={(i % 3) * 80} className="rounded-3xl border border-white/[0.06] bg-[#0f1012] p-5">
              <p.icon className="h-5 w-5 text-lime-300" aria-hidden="true" />
              <h3 className="mt-3 text-base font-bold text-white">{p.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{p.body}</p>
            </Reveal>
          ))}
        </ul>
        <Reveal className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm">
          <Link to="/privacy" className="inline-flex min-h-[44px] items-center font-semibold text-lime-300 underline-offset-4 hover:underline">Privacy Policy</Link>
          <Link to="/terms" className="inline-flex min-h-[44px] items-center font-semibold text-lime-300 underline-offset-4 hover:underline">Terms</Link>
          <Link to="/delete-account" className="inline-flex min-h-[44px] items-center font-semibold text-lime-300 underline-offset-4 hover:underline">Delete your account</Link>
          <a href="/support" className="inline-flex min-h-[44px] items-center font-semibold text-lime-300 underline-offset-4 hover:underline">Support</a>
        </Reveal>
      </div>
    </section>
  );
}
