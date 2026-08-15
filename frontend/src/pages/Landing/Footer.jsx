import { Zap } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="relative border-t border-zinc-800/80 bg-black px-5 pb-10 pt-20">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
        
        {/* Brand */}
        <div className="flex flex-col items-center md:items-start gap-4">
          <a href="#" className="flex items-center gap-2 group">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-lime-400 shadow-lg shadow-lime-400/20">
              <Zap className="h-3.5 w-3.5 fill-black text-black" />
            </div>
            <span className="text-lg font-bold tracking-tight text-lime-400">
              Spendly
            </span>
          </a>
          <p className="text-sm text-zinc-500 max-w-xs text-center md:text-left">
            Your personal finance companion for the modern world. Track, save, and split effortlessly.
          </p>
        </div>

        {/* Links */}
        <div className="flex gap-8 text-sm font-medium text-zinc-400">
          <a href="#" className="transition-colors hover:text-lime-400">Privacy Policy</a>
          <a href="#" className="transition-colors hover:text-lime-400">Terms of Service</a>
          <a href="#" className="transition-colors hover:text-lime-400">Contact</a>
        </div>

      </div>

      <div className="max-w-7xl mx-auto mt-12 pt-8 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-zinc-600">
        <p>© {new Date().getFullYear()} Spendly Inc. All rights reserved.</p>
        <p className="flex items-center gap-1.5">
          Built with <span className="text-red-500 animate-pulse">❤️</span> for the next generation.
        </p>
      </div>
    </footer>
  );
}
