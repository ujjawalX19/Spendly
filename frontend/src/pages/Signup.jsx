import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Wallet } from 'lucide-react';

export default function Signup() {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const { signup } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        const res = await signup(name, email, password);
        if (res.success) {
            navigate('/dash');
        } else {
            setError(res.message || 'Signup failed');
        }
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-[var(--color-bg)]">
            <div className="w-full max-w-md p-8 glass-card border border-[var(--color-electric-blue)]/30">
                <div className="flex flex-col items-center mb-8">
                    <Wallet className="w-12 h-12 text-[var(--color-electric-blue)] mb-2" />
                    <h1 className="text-3xl font-extrabold text-[var(--color-electric-blue)]">Spendly</h1>
                    <p className="text-[var(--color-text)]/70 text-sm mt-1">Join the smart spending club.</p>
                </div>

                {error && (
                    <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm text-center">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-[var(--color-text)]/80 mb-1">Name</label>
                        <input 
                            type="text" 
                            required 
                            value={name} 
                            onChange={(e) => setName(e.target.value)}
                            className="w-full bg-[var(--input-bg)] border border-[var(--glass-border)] rounded-xl px-4 py-3 outline-none focus:border-[var(--color-electric-blue)] transition-colors"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-[var(--color-text)]/80 mb-1">Email</label>
                        <input 
                            type="email" 
                            required 
                            value={email} 
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full bg-[var(--input-bg)] border border-[var(--glass-border)] rounded-xl px-4 py-3 outline-none focus:border-[var(--color-electric-blue)] transition-colors"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-[var(--color-text)]/80 mb-1">Password</label>
                        <input 
                            type="password" 
                            required 
                            minLength={6}
                            value={password} 
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-[var(--input-bg)] border border-[var(--glass-border)] rounded-xl px-4 py-3 outline-none focus:border-[var(--color-electric-blue)] transition-colors"
                        />
                    </div>
                    <button 
                        type="submit" 
                        className="w-full bg-[var(--color-electric-blue)] text-black font-extrabold py-3 rounded-xl mt-4 hover:scale-[1.02] active:scale-95 transition-transform"
                    >
                        Sign Up
                    </button>
                </form>

                <p className="mt-6 text-center text-sm text-[var(--color-text)]/60">
                    Already have an account? <Link to="/login" className="text-[var(--color-electric-blue)] font-bold hover:underline">Login</Link>
                </p>
            </div>
        </div>
    );
}
