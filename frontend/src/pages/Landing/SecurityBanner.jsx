import { ShieldCheck, Trash2, Lock } from 'lucide-react';

export default function SecurityBanner() {
  return (
    <section id="security" className="relative overflow-hidden border-y border-zinc-800/80 bg-black py-12">
      {/* Subtle glow */}
      <div className="absolute inset-0 bg-gradient-to-r from-lime-400/5 via-transparent to-emerald-400/5" />
      
      <div className="max-w-7xl mx-auto px-5 relative z-10 flex flex-col md:flex-row items-center justify-center gap-6 md:gap-16 text-sm text-zinc-400 font-medium">
        
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-5 h-5 text-emerald-400" />
          <span>Each account can read only its own data</span>
        </div>

        <div className="hidden md:block w-1.5 h-1.5 rounded-full bg-zinc-800" />

        <div className="flex items-center gap-3">
          <Trash2 className="h-5 w-5 text-lime-400" />
          <span>Export or delete your data any time</span>
        </div>

        <div className="hidden md:block w-1.5 h-1.5 rounded-full bg-zinc-800" />

        <div className="flex items-center gap-3">
          <Lock className="w-5 h-5 text-emerald-400" />
          <span>HTTPS everywhere · no SMS access</span>
        </div>

      </div>
    </section>
  );
}
