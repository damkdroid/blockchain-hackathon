import { ArrowRight, ShieldCheck, Route, Gavel, Cpu } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';

export default function Landing() {
    const navigate = useNavigate();

    const handleSignIn = () => {
        navigate('/login');
    };

    return (
        <div className="min-h-screen bg-background text-on-background">
            <Header />
            <main className="pt-24 pb-16">
                {/* Hero Section */}
                <section className="relative px-6 py-32 flex flex-col items-center text-center">
                    <div className="max-w-4xl space-y-8 z-10">

                        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tighter text-white leading-tight">
                            The Future of <span className="text-transparent bg-clip-text bg-gradient-to-br from-cyan-400 to-cyan-600">Financial Integrity.</span>
                        </h1>
                        <p className="text-lg text-zinc-400 max-w-2xl mx-auto">
                            Immutable, transparent, and decentralized record management for the modern enterprise
                        </p>
                        <div className="pt-8 flex gap-4 justify-center">
                            <button 
                                onClick={handleSignIn}
                                className="bg-cyan-500 text-black font-bold px-8 py-4 rounded-md flex items-center gap-2 hover:bg-cyan-400 transition-all">
                                Sign In <ArrowRight size={16} />
                            </button>

                        </div>
                    </div>
                </section>

                {/* Core Infrastructure - Key Features [cite: 47] */}
                <section className="px-6 py-24 max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
                    <FeatureCard
                        icon={<ShieldCheck className="text-cyan-400" size={32} />}
                        title="Cryptographic Security"
                        desc="RSA signatures and SHA-256 hashing securing every transaction."
                    />
                    <FeatureCard
                        icon={<Route className="text-green-400" size={32} />}
                        title="Absolute Traceability"
                        desc="Permanent and tamper-proof transaction history stored in an immutable ledger."
                    />
                    <FeatureCard
                        icon={<Gavel className="text-purple-400" size={32} />}
                        title="Decentralized Governance"
                        desc="Role-based governance and multi-signature approval protocols."
                    />
                </section>
            </main>
        </div>
    );
}

function FeatureCard({ icon, title, desc }) {
    return (
        <div className="bg-[#1c1b1b] p-8 rounded-xl border border-transparent hover:border-cyan-500/30 transition-all group">
            <div className="mb-6">{icon}</div>
            <h3 className="text-xl font-bold text-white mb-3">{title}</h3>
            <p className="text-sm text-zinc-400 leading-relaxed">{desc}</p>
        </div>
    );
}