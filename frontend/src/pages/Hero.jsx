import { useNavigate } from 'react-router-dom';

export default function Hero() {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-4 text-center relative overflow-hidden bg-[var(--color-bg)] transition-colors">
            {/* Background glow effects */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[var(--color-neon-green)]/10 blur-[120px] rounded-full mix-blend-screen pointer-events-none" />
            <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-[#00f0ff]/10 blur-[100px] rounded-full mix-blend-screen pointer-events-none" />

            <div className="glass-card max-w-2xl z-10 p-8 md:p-12 border border-[var(--color-neon-green)]/30 backdrop-blur-xl animate-in fade-in slide-in-from-bottom-4 duration-700">
                <div className="inline-block px-4 py-1.5 rounded-full border border-[var(--color-neon-green)]/30 text-[var(--color-neon-green)] text-xs font-bold tracking-widest uppercase mb-8 shadow-[0_0_10px_rgba(57,255,20,0.2)]">
                    Vittova
                </div>

                <h1 className="text-5xl md:text-7xl font-extrabold mb-6 tracking-tight leading-tight">
                    Smart Finances. <br />
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--color-neon-green)] to-[#00f0ff]">
                        Zero BS.
                    </span>
                    <br /> Maximum Rizz.
                </h1>
                <p className="text-lg md:text-xl text-[var(--color-text)]/70 mb-10 max-w-lg mx-auto">
                    Track expenses, split bills, and let our AI roast your poor financial decisions.
                </p>

                <button
                    onClick={() => navigate('/login')}
                    className="bg-[var(--color-neon-green)] text-black font-extrabold py-4 px-10 rounded-full text-lg shadow-[0_0_20px_rgba(57,255,20,0.4)] transition-all hover:shadow-[0_0_40px_rgba(57,255,20,0.6)] hover:scale-105 active:scale-95"
                >
                    Get Started
                </button>
            </div>
        </div>
    );
}
