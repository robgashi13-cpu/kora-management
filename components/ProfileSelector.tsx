import React, { useState } from 'react';
import { Plus, Lock, Eye, EyeOff, Pencil, Trash2, X } from 'lucide-react';
import { motion } from 'framer-motion';

interface ProfileSelectorProps {
    profiles: string[];
    onSelect: (profile: string) => void;
    onAdd: (name: string) => void;
    onDelete: (name: string) => void;
    onEdit: (oldName: string, newName: string) => void;
}

export default function ProfileSelector({ profiles, onSelect, onAdd, onDelete, onEdit }: ProfileSelectorProps) {
    const [isAdding, setIsAdding] = useState(false);
    const [newName, setNewName] = useState('');
    const [editingProfile, setEditingProfile] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [isManaging, setIsManaging] = useState(false);

    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    const handleSelect = (p: string) => {
        if (p === 'Admin') {
            setShowPasswordModal(true);
            setPassword('');
            setShowPassword(false);
        } else {
            onSelect(p);
        }
    };

    const confirmPassword = () => {
        if (password === 'Robertoo1396$') {
            onSelect('Admin');
            setShowPasswordModal(false);
        } else {
            alert("Incorrect Password!");
        }
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
        onAdd(trimmed);
        setNewName('');
        setIsAdding(false);
    };

    const handleEditSave = () => {
        if (!editingProfile || !editName.trim()) return;
        if (editName.trim() !== editingProfile) {
            onEdit(editingProfile, editName.trim());
        }
        setEditingProfile(null);
    };

    const handleDelete = () => {
        if (!editingProfile) return;
        if (confirm(`Delete profile "${editingProfile}"?`)) {
            onDelete(editingProfile);
            setEditingProfile(null);
        }
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
                    <motion.div
                        key={p}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handleSelect(p)}
                        className="group flex flex-col items-center gap-4 relative cursor-pointer"
                    >
                        <div className={`w-28 h-28 md:w-36 md:h-36 rounded-xl flex items-center justify-center text-5xl font-bold shadow-2xl border-2 transition-colors ${p === 'Admin' ? 'bg-gradient-to-br from-red-900 to-black border-red-500/50 group-hover:border-red-500'
                            : 'bg-gradient-to-br from-blue-900 to-black border-blue-500/50 group-hover:border-blue-500'
                            }`}>
                            {p === 'Admin' ? <Lock className="w-12 h-12 text-red-500" /> : <span className="text-white">{p[0].toUpperCase()}</span>}
                        </div>
                        <span className="text-xl text-gray-400 group-hover:text-white transition-colors">{p}</span>
                        {p !== 'Admin' && (
                            <div className={`absolute top-2 right-2 flex gap-2 transition-all ${isManaging ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingProfile(p);
                                        setEditName(p);
                                    }}
                                    className="p-2 bg-black/50 hover:bg-black/80 rounded-full text-gray-400 hover:text-white"
                                    title="Edit Profile"
                                >
                                    <Pencil className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (confirm(`Delete profile "${p}"?`)) onDelete(p);
                                    }}
                                    className="p-2 bg-black/50 hover:bg-red-900/80 rounded-full text-gray-400 hover:text-red-400"
                                    title="Delete Profile"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        )}
                    </motion.div>
                ))}

                <div className="flex flex-col items-center gap-4">
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
                    <button
                        onClick={() => setIsManaging(!isManaging)}
                        className={`text-sm font-bold px-6 py-2 rounded-full border transition-all ${isManaging ? 'bg-red-600 text-white border-red-600 hover:bg-red-700' : 'bg-white/5 border-white/20 text-gray-500 hover:text-white hover:bg-white/10'}`}
                    >
                        {isManaging ? 'Done Managing' : 'Manage Profiles'}
                    </button>
                </div>
            </div>

            {/* Admin Password Modal */}
            {showPasswordModal && (
                <div className="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center p-4">
                    <div className="bg-[#1a1a1a] p-8 rounded-2xl border border-white/10 w-full max-w-sm text-center relative">
                        <button onClick={() => setShowPasswordModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white"><Plus className="rotate-45" /></button>
                        <h2 className="text-2xl font-bold mb-6 text-white">Enter Admin Password</h2>

                        <div className="relative mb-6">
                            <input
                                type={showPassword ? "text" : "password"}
                                autoFocus
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                className="w-full bg-black border border-white/20 rounded-xl p-4 text-center text-xl focus:border-blue-500 outline-none text-white pr-12"
                                onKeyDown={e => e.key === 'Enter' && confirmPassword()}
                            />
                            <button
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                            >
                                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                            </button>
                        </div>

                        <button onClick={confirmPassword} className="w-full py-3 rounded-xl bg-white text-black font-bold hover:bg-gray-200">
                            Login
                        </button>
                    </div>
                </div>
            )}

            {editingProfile && (
                <div className="fixed inset-0 bg-black/90 z-[70] flex items-center justify-center p-4">
                    <div className="bg-[#1a1a1a] p-8 rounded-2xl border border-white/10 w-full max-w-md text-center relative">
                        <button onClick={() => setEditingProfile(null)} className="absolute top-4 right-4 text-gray-400 hover:text-white"><X className="w-6 h-6" /></button>
                        <h2 className="text-2xl font-bold mb-6 text-white">Edit Profile</h2>

                        <input
                            autoFocus
                            value={editName}
                            onChange={e => setEditName(e.target.value)}
                            placeholder="Profile Name"
                            className="w-full bg-black border border-white/20 rounded-xl p-4 text-center text-xl mb-6 focus:border-blue-500 outline-none text-white"
                            onKeyDown={e => e.key === 'Enter' && handleEditSave()}
                        />

                        <div className="flex gap-4">
                            <button onClick={handleDelete} className="px-6 py-3 rounded-xl bg-red-500/20 text-red-400 border border-red-500/50 hover:bg-red-500/30 flex items-center gap-2">
                                <Trash2 className="w-5 h-5" /> Delete
                            </button>
                            <button onClick={handleEditSave} className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-500">
                                Save Changes
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
