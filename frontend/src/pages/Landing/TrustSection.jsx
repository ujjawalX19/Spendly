import { Link } from 'react-router-dom';
import { Lock, BellOff, Trash2, Download, EyeOff, Mail } from 'lucide-react';
import { Reveal, SectionHeading, WRAP } from './shared';
import { SUPPORT_EMAIL } from '../../lib/legal';

// Each point describes how Vittova actually works (see /privacy).
const POINTS = [
  { icon: Lock, title: 'Your data is yours alone', body: 'Each account can read only its own records, and every change goes through our server over HTTPS.' },
  { icon: BellOff, title: 'No bank password', body: "Vittova never connects to your bank or asks for its password. With your permission, the Android app reads your bank's debit SMS to add payments for you, and never messages from people." },
  { icon: EyeOff, title: 'No ads, no selling data', body: "We don't show ads, sell your data or use your finances for advertising. The AI never receives your name or email." },
  { icon: Download, title: 'Export any time', body: 'Download all your expenses as a CSV file from your profile.' },
  { icon: Trash2, title: 'Delete in one place', body: "Delete your account and data from the app, or follow the steps on our website if you can't sign in." },
  { icon: Mail, title: 'Real support', body: `Questions or requests go to ${SUPPORT_EMAIL}.` },
];

const LINKS = [
  { to: '/privacy', label: 'Privacy Policy' },
  { to: '/terms', label: 'Terms' },
  { to: '/delete-account', label: 'Delete your account' },
];

export default function TrustSection() {
  return (
    <section id="trust" className="scroll-mt-20 border-t border-line py-20 lg:py-28">
      <div className={WRAP}>
        <SectionHeading eyebrow="Privacy and security" title="Built for money you care about." />
        <ul className="mt-12 grid gap-x-8 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
          {POINTS.map((p, i) => (
            <Reveal as="li" key={p.title} delay={(i % 3) * 70}>
              <p.icon className="h-5 w-5 text-ink" strokeWidth={1.75} aria-hidden="true" />
              <h3 className="mt-3 text-base font-semibold text-ink">{p.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-ink-2">{p.body}</p>
            </Reveal>
          ))}
        </ul>
        <Reveal className="mt-10 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          {LINKS.map((l) => <Link key={l.to} to={l.to} className="l-link inline-flex min-h-[44px] items-center font-medium">{l.label}</Link>)}
          <a href="/support" className="l-link inline-flex min-h-[44px] items-center font-medium">Support</a>
        </Reveal>
      </div>
    </section>
  );
}
