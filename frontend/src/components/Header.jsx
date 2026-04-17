import { Shield, Bell, Contrast, Landmark } from 'lucide-react';

export default function Header() {
    return (
        <header className="fixed top-0 w-full z-50 bg-[#131313]/60 backdrop-blur-xl border-b border-white/10">
            <div className="flex justify-between items-center px-6 h-16 w-full">
                <div className="flex items-center gap-2">
                    <Landmark className="text-cyan-400 w-6 h-6" />
                    <span className="font-bold text-xl tracking-tighter text-cyan-400">The Kinetic Ledger</span>
                </div>
                <div className="flex items-center gap-4">
                    <button className="text-zinc-400 hover:text-cyan-300"><Contrast size={20} /></button>
                    <button className="text-zinc-400 hover:text-cyan-300"><Bell size={20} /></button>
                    <div className="w-8 h-8 rounded-full bg-zinc-700 border border-white/10" />
                </div>
            </div>
        </header>
    );
}