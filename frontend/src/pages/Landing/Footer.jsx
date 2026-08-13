import { Zap } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="bg-zinc-950 pt-20 pb-10 px-5 border-t border-white/5 relative">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
        
        {/* Brand */}
        <div className="flex flex-col items-center md:items-start gap-4">
          <a href="#" className="flex items-center gap-2 group">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Zap className="w-3.5 h-3.5 text-zinc-950 fill-zinc-950" />
            </div>
            <span className="font-bold text-lg tracking-tight text-white">
              Spendly
            </span>
          </a>
          <p className="text-sm text-zinc-500 max-w-xs text-center md:text-left">
            Your personal finance companion for the modern world. Track, save, and split effortlessly.
          </p>
        </div>

        {/* Links */}
        <div className="flex gap-8 text-sm font-medium text-zinc-400">
          <a href="#" className="hover:text-emerald-400 transition-colors">Privacy Policy</a>
          <a href="#" className="hover:text-emerald-400 transition-colors">Terms of Service</a>
          <a href="#" className="hover:text-emerald-400 transition-colors">Contact</a>
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
