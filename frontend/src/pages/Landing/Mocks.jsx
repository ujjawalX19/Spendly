/**
 * The screens shown on the homepage. They are drawn with the app's own blocks,
 * tiles and colour roles (index.css), not screenshots, so they stay sharp at
 * any size and follow the dark and light looks. Every figure is an example and
 * is labelled as one; no company names are used.
 */
import { Bell, CalendarClock, Flame, MessageCircle, PiggyBank, Plus, ScanLine, ShoppingBag, ShoppingBasket, Smartphone, TrainFront, Utensils, Wallet } from 'lucide-react';
import PulseMark from '../../components/PulseMark';

/** A phone-width frame around a screen, described once for screen readers. */
function Frame({ label, children }) {
  return (
    <figure className="mx-auto w-full max-w-[360px]">
      <div role="img" aria-label={label} className="rounded-[1.75rem] border border-line-strong bg-bg p-3">
        <div aria-hidden="true" className="space-y-2.5">{children}</div>
      </div>
      <figcaption className="mt-3 text-center text-xs text-ink-3">Example figures</figcaption>
    </figure>
  );
}

function Item({ icon: Icon, title, meta, value, note }) {
  return (
    <div className="v-item">
      <span className="v-item-icon"><Icon className="h-[18px] w-[18px]" strokeWidth={1.75} /></span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink">{title}</span>
        <span className="block truncate text-xs text-ink-2">{meta}</span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-sm font-semibold tabular-nums text-ink">{value}</span>
        {note && <span className={`block text-xs ${note.tone}`}>{note.text}</span>}
      </span>
    </div>
  );
}

const ACTIONS = [[Plus, 'Add'], [ScanLine, 'Scan'], [ShoppingBag, 'Afford-It'], [MessageCircle, 'Ask']];

export function HomeMock() {
  return (
    <Frame label="The Vittova home screen: ₹7,157 left to spend this month, four quick actions, and today's spending against a safe daily amount.">
      <div className="flex items-center justify-between">
        <span className="v-round text-[13px] font-semibold">AS</span>
        <span className="flex gap-2.5">
          <span className="v-round"><ScanLine className="h-[18px] w-[18px]" strokeWidth={1.75} /></span>
          <span className="v-round"><Bell className="h-[18px] w-[18px]" strokeWidth={1.75} /></span>
        </span>
      </div>
      <div className="v-hero-card p-4 min-[360px]:p-5">
        <div className="flex items-start justify-between">
          <p className="text-xs text-white/75">Left to spend</p>
          <PulseMark />
        </div>
        <p className="mt-1.5 text-[32px] font-semibold leading-none tabular-nums">₹7,157<span className="text-white/55">.00</span></p>
        <p className="mt-4 inline-flex min-h-[24px] items-center rounded-md bg-white/15 px-2 text-[11px] font-medium">On track</p>
        <div className="mt-5 flex items-end justify-between gap-3 whitespace-nowrap text-xs min-[360px]:text-[13px]">
          <div>
            <p className="text-[10px] text-white/70">After setting aside</p>
            <p className="mt-0.5 font-semibold">₹3,000 savings</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-white/70">24 days left</p>
            <p className="mt-0.5 font-medium tabular-nums">₹9,843 <span className="text-white/70">of</span> ₹20,000</p>
          </div>
        </div>
        <div className="mt-3.5 h-1 overflow-hidden rounded-full bg-white/20">
          <div className="l-grow h-full rounded-full bg-white" style={{ '--w': '49%' }} />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2.5">
        {ACTIONS.map(([Icon, label]) => (
          <span key={label} className="v-tile whitespace-nowrap px-0 text-[11px] min-[360px]:text-xs"><Icon className="h-5 w-5" strokeWidth={1.75} /><span>{label}</span></span>
        ))}
      </div>
      <div className="v-block p-4">
        <p className="v-label">Daily spending</p>
        <p className="mt-1 flex items-baseline gap-2">
          <span className="text-2xl font-semibold tabular-nums text-ink">₹210</span>
          <span className="text-xs text-ink-2">Safe: ₹298 / day</span>
        </p>
        <div className="mt-3 flex h-1.5 gap-1">
          <span className="rounded-full bg-accent" style={{ width: '52%' }} />
          <span className="rounded-full bg-info" style={{ width: '18%' }} />
          <span className="flex-1 rounded-full bg-surface-2" />
        </div>
        <p className="mt-2.5 flex gap-4 text-xs text-ink-2">
          <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-accent" />Groceries</span>
          <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-info" />Food</span>
        </p>
      </div>
    </Frame>
  );
}

export function ActivityMock() {
  return (
    <Frame label="The Activity screen: today's expenses, each with its category and how it was added.">
      <div className="flex items-baseline justify-between px-1 pt-1">
        <p className="v-h">Today</p>
        <p className="text-xs tabular-nums text-ink-2">₹2,019</p>
      </div>
      <Item icon={ShoppingBasket} title="Groceries" meta="Shopping · Receipt scan" value="₹1,240" />
      <Item icon={Utensils} title="Lunch" meta="Food · Auto-tracked" value="₹180" />
      <Item icon={Smartphone} title="Phone bill" meta="Bills · Auto-tracked" value="₹399" />
      <Item icon={TrainFront} title="Metro card" meta="Transport" value="₹200" />
    </Frame>
  );
}

export function WealthMock() {
  return (
    <Frame label="The Wealth screen: budget used, bills still due, the savings target, and a SIP stress test result.">
      <div className="v-block p-4">
        <p className="text-xs text-ink-2">Left in budget</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">₹7,157</p>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2">
          <div className="l-grow h-full rounded-full bg-warn" style={{ '--w': '49%' }} />
        </div>
        <p className="mt-2 text-xs text-ink-2">₹9,843 of ₹20,000 spent · 49% used</p>
      </div>
      <Item icon={CalendarClock} title="Bills still due" meta="Phone recharge in 5 days" value="₹2,000" />
      <Item icon={PiggyBank} title="Savings target" meta="15% of budget" value="₹3,000" note={{ text: 'Set aside', tone: 'text-accent' }} />
      <Item icon={Wallet} title="SIP stress test" meta="₹1,500 a month" value="Fits" note={{ text: 'your month', tone: 'text-ink-2' }} />
    </Frame>
  );
}

export function ChatMock() {
  return (
    <Frame label="An example Ask Vittova conversation: a question about weekend spending, answered with figures from the person's own month.">
      <div className="v-block space-y-3 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-ink"><MessageCircle className="h-4 w-4" strokeWidth={1.75} /> Ask Vittova</p>
        <div className="flex justify-end">
          <p className="max-w-[85%] rounded-2xl rounded-br-md bg-surface-2 px-4 py-2.5 text-sm text-ink">Can I spend ₹3,000 this weekend?</p>
        </div>
        <div className="max-w-[94%] text-sm leading-relaxed text-ink-soft">
          <p className="font-semibold text-ink">You can, but it squeezes the rest of your month.</p>
          <p className="mt-2">You have <b className="font-semibold text-ink">₹420 a day</b> for the next 12 days, after setting aside the <b className="font-semibold text-ink">₹2,000</b> bill due in 4 days. Spending ₹3,000 now would leave about <b className="font-semibold text-ink">₹170 a day</b>.</p>
        </div>
      </div>
    </Frame>
  );
}

const WEEK = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function HabitMock() {
  return (
    <Frame label="Money Streak and Save-to-Earn: a five-day streak, today's mission, and a seven-day challenge.">
      <div className="v-block p-4">
        <div className="flex items-center gap-3">
          <span className="v-item-icon"><Flame className="h-[18px] w-[18px] text-flame" strokeWidth={1.75} /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-ink">5-day streak</span>
            <span className="block text-xs text-ink-2">Level 1 · Money Starter</span>
          </span>
        </div>
        <div className="mt-4 flex justify-between">
          {WEEK.map((day, i) => (
            <span key={i} className={`flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-semibold ${i < 5 ? 'bg-flame text-on-fill' : 'bg-surface-2 text-ink-3'}`}>{i < 5 ? '✓' : day}</span>
          ))}
        </div>
      </div>
      <div className="v-block p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-ink-2">Today's mission</p>
          <p className="text-xs font-medium text-accent">✓ Done</p>
        </div>
        <p className="mt-1 text-sm font-semibold text-ink">Log today's spending</p>
      </div>
      <div className="v-block p-4">
        <p className="text-xs text-ink-2">Suggested for you</p>
        <p className="mt-1 text-sm font-semibold text-ink">7-Day Zero Food Delivery</p>
        <p className="mt-0.5 text-xs text-ink-2">7 days · +75 XP</p>
        <span className="v-btn-primary mt-3 min-h-10 w-full text-sm">Start challenge</span>
      </div>
    </Frame>
  );
}
