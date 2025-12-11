import React, { useState } from 'react';
import { Plus, Lock } from 'lucide-react';
import { motion } from 'framer-motion';

interface ProfileSelectorProps {
    profiles: string[];
    onSelect: (profile: string) => void;
    onAdd: (name: string) => void;
}

export default function ProfileSelector({ profiles, onSelect, onAdd }: ProfileSelectorProps) {
    const [isAdding, setIsAdding] = useState(false);
    const [newName, setNewName] = useState('');

    const handleSelect = (p: string) => {
        if (p === 'Admin') {
            const pwd = prompt("Enter Admin Password:");
            if (pwd !== 'Robertoo1396$') {
                alert("Incorrect Password!");
                return;
            }
        }
        onSelect(p);
    };

    const handleAdd = () => {
        const trimmed = newName.trim();
        if (!trimmed) return;
        if (profiles.includes(trimmed)) {
            alert('Profile already exists!');
            return;
        }
        onAdd(trimmed);
        setNewName('');
        setIsAdding(false);
    };

    if (isAdding) {
        return (
            <div className="fixed inset-0 bg-black z-50 flex items-center justify-center p-4">
                <div className="bg-[#1a1a1a] p-8 rounded-2xl border border-white/10 w-full max-w-md text-center">
                    <h2 className="text-2xl font-bold mb-6 text-white">Add Profile</h2>
                    <input
                        autoFocus
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        placeholder="Profile Name"
                        className="w-full bg-black border border-white/20 rounded-xl p-4 text-center text-xl mb-6 focus:border-blue-500 outline-none text-white"
                        onKeyDown={e => e.key === 'Enter' && handleAdd()}
                    />
                    <div className="flex gap-4">
                        <button onClick={() => setIsAdding(false)} className="flex-1 py-3 rounded-xl border border-white/20 hover:bg-white/5 text-gray-300">Cancel</button>
                        <button onClick={handleAdd} className="flex-1 py-3 rounded-xl bg-white text-black font-bold hover:bg-gray-200">Save</button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black z-50 flex flex-col items-center justify-center p-4">
            <h1 className="text-4xl md:text-5xl font-bold mb-12 tracking-tight text-white">Who is working?</h1>

            <div className="flex flex-wrap justify-center gap-6 md:gap-8 max-w-4xl">
                {profiles.map(p => (
                    <motion.button
                        key={p}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handleSelect(p)}
                        className="group flex flex-col items-center gap-4"
                    >
                        <div className={`w-28 h-28 md:w-36 md:h-36 rounded-xl flex items-center justify-center text-5xl font-bold shadow-2xl border-2 transition-colors ${p === 'Admin' ? 'bg-gradient-to-br from-red-900 to-black border-red-500/50 group-hover:border-red-500'
                                : 'bg-gradient-to-br from-blue-900 to-black border-blue-500/50 group-hover:border-blue-500'
                            }`}>
                            {p === 'Admin' ? <Lock className="w-12 h-12 text-red-500" /> : <span className="text-white">{p[0].toUpperCase()}</span>}
                        </div>
                        <span className="text-xl text-gray-400 group-hover:text-white transition-colors">{p}</span>
                    </motion.button>
                ))}

                <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setIsAdding(true)}
                    className="group flex flex-col items-center gap-4"
                >
                    <div className="w-28 h-28 md:w-36 md:h-36 rounded-xl flex items-center justify-center border-2 border-white/20 hover:bg-white/10 transition-colors bg-black/50">
                        <Plus className="w-12 h-12 text-gray-400 group-hover:text-white" />
                    </div>
                    <span className="text-xl text-gray-400 group-hover:text-white transition-colors">Add Profile</span>
                </motion.button>
            </div>
        </div>
    );
}
