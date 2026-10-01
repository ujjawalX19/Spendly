import {
  Utensils, Car, ShoppingBag, Smartphone, Clapperboard, Home, ReceiptText, HeartPulse, GraduationCap, Wallet,
} from 'lucide-react';

/**
 * One icon per spending category, in one quiet tile. The category is told by
 * the icon's shape, not by a colour per category: money lists stay calm and
 * the brand colour keeps its meaning.
 */
const ICONS = {
  Food: Utensils,
  Transport: Car,
  Shopping: ShoppingBag,
  Recharge: Smartphone,
  Entertainment: Clapperboard,
  Rent: Home,
  Bills: ReceiptText,
  Health: HeartPulse,
  Education: GraduationCap,
};

export default function CategoryIcon({ category, className = '' }) {
  const Icon = ICONS[category] || Wallet;
  return (
    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[.06] text-zinc-300 ${className}`} aria-hidden="true">
      <Icon className="h-[18px] w-[18px]" strokeWidth={1.9} />
    </span>
  );
}
