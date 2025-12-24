import React, { useState, useRef } from 'react';
import { Plus, Lock, Eye, EyeOff, Pencil, Trash2, X, Camera } from 'lucide-react';
import { motion } from 'framer-motion';

interface ProfileSelectorProps {
    profiles: string[];
    onSelect: (profile: string, remember: boolean) => void;
    onAdd: (name: string, remember: boolean) => void;
    onDelete: (name: string) => void;
    onEdit: (oldName: string, newName: string) => void;
    avatars: Record<string, string>;
    onEditAvatar: (name: string, base64: string) => void;
    rememberDefault?: boolean;
}

export default function ProfileSelector({ profiles, onSelect, onAdd, onDelete, onEdit, avatars, onEditAvatar, rememberDefault = false }: ProfileSelectorProps) {
    const [isAdding, setIsAdding] = useState(false);
    const [newName, setNewName] = useState('');
    const [editingProfile, setEditingProfile] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [isManaging, setIsManaging] = useState(false);
    const [rememberMe, setRememberMe] = useState(rememberDefault);

    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    const [pendingProfile, setPendingProfile] = useState<string | null>(null);

    // Long press detection (4 seconds = 4000ms)
    const longPressTimer = useRef<NodeJS.Timeout | null>(null);
    const isLongPress = useRef(false);

    const handleTouchStart = () => {
        isLongPress.current = false;
        longPressTimer.current = setTimeout(() => {
            isLongPress.current = true;
            setIsManaging(true);
        }, 4000);
    };

    const handleTouchEnd = () => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    };

    const handleProfileClick = (p: string) => {
        if (isLongPress.current) {
            isLongPress.current = false;
            return; // Don't select if it was a long press
        }
        handleSelect(p);
    };

    const handleSelect = (p: string) => {
        if (p === 'Admin' || p === 'Robert') {
            setPendingProfile(p);
            setShowPasswordModal(true);
            setPassword('');
            setShowPassword(false);
        } else {
            onSelect(p, rememberMe);
        }
    };

    const confirmPassword = () => {
        if (password === 'Robertoo1396$' && pendingProfile) {
            onSelect(pendingProfile, rememberMe);
            setShowPasswordModal(false);
            setPendingProfile(null);
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
        onAdd(trimmed, rememberMe);
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
            <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4">
                <div className="bg-white p-8 rounded-2xl border border-slate-200 w-full max-w-md text-center shadow-xl">
                    <h2 className="text-2xl font-bold mb-6 text-slate-900">Add Profile</h2>
                    <input
                        autoFocus
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        placeholder="Profile Name"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-center text-xl mb-6 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 outline-none text-slate-700"
                        onKeyDown={e => e.key === 'Enter' && handleAdd()}
                    />
                    <div className="flex gap-4">
                        <button onClick={() => setIsAdding(false)} className="flex-1 py-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-500">Cancel</button>
                        <button onClick={handleAdd} className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-500">Save</button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-white z-50 overflow-y-auto">
            <div className="min-h-full flex flex-col items-center justify-center p-4">
                <h1 className="text-4xl md:text-5xl font-bold mb-12 tracking-tight text-slate-900">Who is working?</h1>

                <div className="flex flex-wrap justify-center gap-6 md:gap-8 max-w-4xl">
                    {profiles.map(p => (
                        <motion.div
                            key={p}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => handleProfileClick(p)}
                            onTouchStart={handleTouchStart}
                            onTouchEnd={handleTouchEnd}
                            onMouseDown={handleTouchStart}
                            onMouseUp={handleTouchEnd}
                            onMouseLeave={handleTouchEnd}
                            className="group flex flex-col items-center gap-4 relative cursor-pointer">
                            <div className={`w-28 h-28 md:w-36 md:h-36 rounded-xl flex items-center justify-center text-5xl font-bold shadow-lg border-2 transition-colors overflow-hidden ${(p === 'Admin' || p === 'Robert') ? 'bg-gradient-to-br from-red-50 to-red-100 border-red-200 group-hover:border-red-300'
                                : 'bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200 group-hover:border-blue-300'
                                }`}>
                                {avatars[p] ? <img src={avatars[p]} alt={p} className="w-full h-full object-cover" /> :
                                    (p === 'Admin' || p === 'Robert') ? <Lock className="w-12 h-12 text-red-500" /> :
                                        <span className="text-slate-700">{p[0].toUpperCase()}</span>}
                            </div>
                            <span className="text-xl text-slate-500 group-hover:text-slate-900 transition-colors">{p}</span>
                            <div className={`absolute top-2 right-2 flex gap-2 transition-all ${isManaging ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingProfile(p);
                                        setEditName(p);
                                    }}
                                    className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full text-slate-500 hover:text-slate-700"
                                    title="Edit Profile"
                                >
                                    <Pencil className="w-4 h-4" />
                                </button>
                                {p !== 'Admin' && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (confirm(`Delete profile "${p}"?`)) onDelete(p);
                                        }}
                                        className="p-2 bg-slate-100 hover:bg-red-100 rounded-full text-slate-500 hover:text-red-500"
                                        title="Delete Profile"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        </motion.div>
                    ))}

                    <div className="flex flex-col items-center gap-4">
                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => setIsAdding(true)}
                            className="group flex flex-col items-center gap-4"
                        >
                            <div className="w-28 h-28 md:w-36 md:h-36 rounded-xl flex items-center justify-center border-2 border-slate-200 hover:bg-slate-50 transition-colors bg-white">
                                <Plus className="w-12 h-12 text-slate-400 group-hover:text-slate-700" />
                            </div>
                            <span className="text-xl text-slate-500 group-hover:text-slate-900 transition-colors">Add Profile</span>
                        </motion.button>
                        <button
                            onClick={() => setIsManaging(!isManaging)}
                            className={`text-sm font-bold px-6 py-2 rounded-full border transition-all ${isManaging ? 'bg-red-600 text-white border-red-600 hover:bg-red-700' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
                        >
                            {isManaging ? 'Done Managing' : 'Manage Profiles'}
                        </button>
                    </div>
                </div>

                <div className="mt-10 flex items-center gap-3 rounded-full border border-slate-200 bg-slate-50 px-5 py-2.5 text-sm text-slate-600 shadow-sm">
                    <input
                        id="remember-profile"
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="h-4 w-4 accent-blue-600"
                    />
                    <label htmlFor="remember-profile" className="font-semibold cursor-pointer">
                        Remember me on this device
                    </label>
                </div>

                {/* Admin Password Modal */}
                {showPasswordModal && (
                    <div className="fixed inset-0 bg-slate-900/40 z-[60] flex items-center justify-center p-4">
                        <div className="bg-white p-8 rounded-2xl border border-slate-200 w-full max-w-sm text-center relative shadow-xl">
                            <button onClick={() => setShowPasswordModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"><Plus className="rotate-45" /></button>
                            <h2 className="text-2xl font-bold mb-6 text-slate-900">Enter Admin Password</h2>

                            <div className="relative mb-6">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    autoFocus
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-center text-xl focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 outline-none text-slate-700 pr-12"
                                    onKeyDown={e => e.key === 'Enter' && confirmPassword()}
                                />
                                <button
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                >
                                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                </button>
                            </div>

                            <label className="mb-5 flex items-center justify-center gap-3 text-sm text-slate-600 font-semibold">
                                <input
                                    type="checkbox"
                                    checked={rememberMe}
                                    onChange={(e) => setRememberMe(e.target.checked)}
                                    className="h-4 w-4 accent-blue-600"
                                />
                                Remember me on this device
                            </label>

                            <button onClick={confirmPassword} className="w-full py-3 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-500">
                                Login
                            </button>
                        </div>
                    </div>
                )}

                {editingProfile && (
                    <div className="fixed inset-0 bg-slate-900/40 z-[70] flex items-center justify-center p-4">
                        <div className="bg-white p-8 rounded-2xl border border-slate-200 w-full max-w-md text-center relative shadow-xl">
                            <button onClick={() => setEditingProfile(null)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"><X className="w-6 h-6" /></button>
                            <h2 className="text-2xl font-bold mb-6 text-slate-900">Edit Profile</h2>

                            {/* Avatar Upload */}
                            <div className="relative w-24 h-24 mx-auto mb-6 group">
                                <div className="w-full h-full rounded-full overflow-hidden border-2 border-slate-200 bg-slate-50 flex items-center justify-center">
                                    {avatars[editingProfile] ? (
                                        <img src={avatars[editingProfile]} alt="Avatar" className="w-full h-full object-cover" />
                                    ) : (
                                        <span className="text-4xl text-slate-400">{editingProfile[0]}</span>
                                    )}
                                </div>
                                <label className="absolute bottom-0 right-0 p-2 bg-blue-600 rounded-full cursor-pointer hover:bg-blue-500 transition-colors shadow-lg">
                                    <input
                                        type="file"
                                        className="hidden"
                                        accept="image/*"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) {
                                                const reader = new FileReader();
                                                reader.onloadend = () => {
                                                    if (typeof reader.result === 'string') {
                                                        onEditAvatar(editingProfile, reader.result);
                                                    }
                                                };
                                                reader.readAsDataURL(file);
                                            }
                                        }}
                                    />
                                    <Camera className="w-4 h-4 text-white" />
                                </label>
                            </div>

                            <input
                                autoFocus
                                value={editName}
                                onChange={e => setEditName(e.target.value)}
                                placeholder="Profile Name"
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-center text-xl mb-6 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 outline-none text-slate-700"
                                onKeyDown={e => e.key === 'Enter' && handleEditSave()}
                            />

                            <div className="flex gap-4">
                                <button onClick={handleDelete} className="px-6 py-3 rounded-xl bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 flex items-center gap-2">
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
        </div>
    );
}
