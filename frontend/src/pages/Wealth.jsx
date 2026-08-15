import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { PieChart, Briefcase, Landmark, Bitcoin, TrendingUp, ChevronRight, Loader2, ShieldCheck, AlertTriangle } from 'lucide-react';

const iconMap = {
    PieChart: PieChart,
    Briefcase: Briefcase,
    Landmark: Landmark,
    Bitcoin: Bitcoin,
};

const colorMap = {
    blue: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
    purple: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
    yellow: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
    teal: 'text-teal-400 bg-teal-400/10 border-teal-400/20',
};

export default function Wealth() {
    const [investments, setInvestments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchInvestments = async () => {
            try {
                // Fetch from the backend investments route
                const res = await fetch(`${import.meta.env.VITE_API_URL || 'https://spendly-t8s6.onrender.com/api'}/investments`);
                if (!res.ok) throw new Error('Failed to fetch investments data');
                const data = await res.json();
                setInvestments(data);
            } catch (err) {
                console.error(err);
                setError('Could not load investment ideas. Please try again later.');
            } finally {
                setLoading(false);
            }
        };

        fetchInvestments();
    }, []);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh]">
                <Loader2 className="w-10 h-10 text-[var(--color-electric-blue)] animate-spin mb-4" />
                <p className="text-zinc-500 font-medium">Curating wealth strategies...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
                <AlertTriangle className="w-12 h-12 text-red-500 mb-4 opacity-80" />
                <h3 className="text-xl font-bold text-zinc-200 mb-2">Oops!</h3>
                <p className="text-zinc-500">{error}</p>
                <button 
                    onClick={() => window.location.reload()}
                    className="mt-6 px-6 py-2 bg-zinc-800 text-zinc-300 rounded-full hover:bg-zinc-700 transition"
                >
                    Try Again
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 bg-gradient-to-br from-zinc-900 to-black p-6 rounded-3xl border border-zinc-800/50 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-[var(--color-electric-blue)]/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
                <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-[var(--color-neon-green)]/10 rounded-xl">
                            <TrendingUp className="w-6 h-6 text-[var(--color-neon-green)]" />
                        </div>
                        <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-zinc-400">
                            Wealth Growth
                        </h1>
                    </div>
                    <p className="text-zinc-400 font-medium max-w-md">
                        Grow your <span className="text-[var(--color-neon-green)]">Chillar</span> into massive returns. Explore expert-curated investment strategies tailored for young professionals.
                    </p>
                </div>
                
                <div className="relative z-10 bg-zinc-800/50 backdrop-blur-md border border-zinc-700/50 px-5 py-3 rounded-2xl flex items-center gap-3 w-full md:w-auto">
                    <ShieldCheck className="w-5 h-5 text-emerald-400" />
                    <div>
                        <p className="text-xs text-zinc-400 font-bold uppercase tracking-wider">Risk Managed</p>
                        <p className="text-sm font-semibold text-zinc-200">100% Verified Assets</p>
                    </div>
                </div>
            </div>

            {/* Investment Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {investments.map((inv, index) => {
                    const IconComponent = iconMap[inv.iconType] || TrendingUp;
                    const colorClasses = colorMap[inv.color] || colorMap.blue;

                    return (
                        <motion.div
                            key={inv.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.1 }}
                            className="group relative bg-zinc-900/50 backdrop-blur-sm border border-zinc-800 rounded-3xl p-6 hover:bg-zinc-800/50 hover:border-zinc-700 transition-all duration-300 flex flex-col h-full"
                        >
                            <div className="flex justify-between items-start mb-6">
                                <div className={`p-4 rounded-2xl border ${colorClasses}`}>
                                    <IconComponent className="w-8 h-8" />
                                </div>
                                <div className="bg-zinc-950 border border-zinc-800 px-3 py-1.5 rounded-full flex items-center gap-2">
                                    <div className={`w-2 h-2 rounded-full ${
                                        inv.riskLevel.includes('Zero') || inv.riskLevel.includes('Low') 
                                        ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' 
                                        : 'bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.8)]'
                                    }`} />
                                    <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider">{inv.riskLevel} Risk</span>
                                </div>
                            </div>
                            
                            <h3 className="text-xl font-bold text-zinc-100 mb-3">{inv.title}</h3>
                            <p className="text-zinc-400 text-sm leading-relaxed mb-8 flex-1">
                                {inv.description}
                            </p>
                            
                            <button className="w-full flex items-center justify-between bg-zinc-950 hover:bg-black text-zinc-200 border border-zinc-800 hover:border-[var(--color-electric-blue)]/50 font-bold py-3 px-5 rounded-2xl transition-all group-hover:shadow-[0_0_20px_rgba(59,130,246,0.1)]">
                                <span>{inv.actionText}</span>
                                <ChevronRight className="w-5 h-5 text-zinc-500 group-hover:text-[var(--color-electric-blue)] transition-colors" />
                            </button>
                        </motion.div>
                    );
                })}
            </div>
            
            {/* Disclaimer */}
            <div className="text-center pb-8 pt-4">
                <p className="text-xs text-zinc-600 font-medium">
                    Disclaimer: Investments are subject to market risks. Please read all scheme related documents carefully before investing.
                </p>
            </div>
        </div>
    );
}
