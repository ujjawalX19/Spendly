import { ShieldCheck, Database, Lock } from 'lucide-react';

export default function SecurityBanner() {
  return (
    <section id="security" className="bg-zinc-950 py-12 border-t border-b border-white/5 relative overflow-hidden">
      {/* Subtle glow */}
      <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 via-transparent to-teal-500/5" />
      
      <div className="max-w-7xl mx-auto px-5 relative z-10 flex flex-col md:flex-row items-center justify-center gap-6 md:gap-16 text-sm text-zinc-400 font-medium">
        
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-5 h-5 text-emerald-400" />
          <span>Bank-Grade Security</span>
        </div>

        <div className="hidden md:block w-1.5 h-1.5 rounded-full bg-zinc-800" />

        <div className="flex items-center gap-3">
          <Database className="w-5 h-5 text-teal-400" />
          <span>Powered by PostgreSQL</span>
        </div>

        <div className="hidden md:block w-1.5 h-1.5 rounded-full bg-zinc-800" />

        <div className="flex items-center gap-3">
          <Lock className="w-5 h-5 text-emerald-400" />
          <span>Data Fully Encrypted</span>
        </div>

      </div>
    </section>
  );
}
