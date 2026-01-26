import React, { useState, useRef } from 'react';
import { Plus, Lock, Eye, EyeOff, Pencil, Trash2, X, Camera, RotateCcw } from 'lucide-react';
import { motion } from 'framer-motion';

type ProfileEntry = {
    name: string;
    archived: boolean;
};

interface ProfileSelectorProps {
    profiles: ProfileEntry[];
    onSelect: (profile: string, remember: boolean) => void;
    onAdd: (name: string, email: string, remember: boolean) => void;
    onDelete: (name: string) => void;
    onEdit: (oldName: string, newName: string) => void;
    onRestore: (name: string) => void;
    avatars: Record<string, string>;
    onEditAvatar: (name: string, base64: string) => void;
    rememberDefault?: boolean;
}

export default function ProfileSelector({ profiles, onSelect, onAdd, onDelete, onEdit, onRestore, avatars, onEditAvatar, rememberDefault = false }: ProfileSelectorProps) {
    const ADMIN_PROFILE = 'Robert';
    const ADMIN_PASSWORD = 'Robertoo1396$';
    const [isAdding, setIsAdding] = useState(false);
    const [newName, setNewName] = useState('');
    const [newEmail, setNewEmail] = useState('');
    const [editingProfile, setEditingProfile] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [isManaging, setIsManaging] = useState(false);
    const [rememberMe, setRememberMe] = useState(rememberDefault);

    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [adminAction, setAdminAction] = useState<'select' | 'add' | null>(null);

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
        if (p === ADMIN_PROFILE) {
            setPendingProfile(p);
            setAdminAction('select');
            setShowPasswordModal(true);
            setPassword('');
            setShowPassword(false);
        } else {
            onSelect(p, rememberMe);
        }
    };

    const confirmPassword = () => {
        if (password === ADMIN_PASSWORD) {
            if (adminAction === 'select' && pendingProfile) {
                onSelect(pendingProfile, rememberMe);
                setPendingProfile(null);
            }
            if (adminAction === 'add') {
                setIsAdding(true);
            }
            setShowPasswordModal(false);
            setAdminAction(null);
            setPassword('');
            setShowPassword(false);
        } else {
            alert("Incorrect Password!");
        }
    };

    const handleAdd = () => {
        const trimmed = newName.trim();
        if (!trimmed) return;
        const existing = profiles.find(profile => profile.name === trimmed);
        if (existing && !existing.archived) {
            alert('Profile already exists!');
            return;
        }
        onAdd(trimmed, newEmail.trim(), rememberMe);
        setNewName('');
        setNewEmail('');
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
                <div className="bg-white p-8 rounded-2xl border border-slate-100 w-full max-w-md text-center shadow-[0_8px_24px_rgba(15,23,42,0.12)]">
                    <h2 className="text-2xl font-bold mb-6 text-slate-900">Add Profile</h2>
                    <input
                        autoFocus
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        placeholder="Profile Name"
                        className="w-full bg-white border border-slate-200 rounded-2xl p-4 text-center text-xl mb-6 focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10 outline-none text-slate-700"
                        onKeyDown={e => e.key === 'Enter' && handleAdd()}
                    />
                    <input
                        value={newEmail}
                        onChange={e => setNewEmail(e.target.value)}
                        placeholder="Email (optional)"
                        className="w-full bg-white border border-slate-200 rounded-2xl p-4 text-center text-base mb-6 focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10 outline-none text-slate-700"
                        onKeyDown={e => e.key === 'Enter' && handleAdd()}
                    />
                    <div className="flex gap-4">
                        <button onClick={() => setIsAdding(false)} className="flex-1 py-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-500">Cancel</button>
                        <button onClick={handleAdd} className="flex-1 py-3 rounded-xl bg-slate-900 text-white font-bold hover:bg-slate-800">Save</button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-slate-50 z-50 overflow-y-auto scroll-container">
            <div className="min-h-full flex flex-col items-center justify-center p-4">
                <h1 className="text-4xl md:text-5xl font-bold mb-12 tracking-tight text-slate-900">Who is working?</h1>

                <div className="flex flex-wrap justify-center gap-6 md:gap-8 max-w-4xl">
                    {profiles.map(profile => (
                        <motion.div
                            key={profile.name}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => handleProfileClick(profile.name)}
                            onTouchStart={handleTouchStart}
                            onTouchEnd={handleTouchEnd}
                            onMouseDown={handleTouchStart}
                            onMouseUp={handleTouchEnd}
                            onMouseLeave={handleTouchEnd}
                            className="group flex flex-col items-center gap-4 relative cursor-pointer">
                            <div className={`w-28 h-28 md:w-36 md:h-36 rounded-2xl flex items-center justify-center text-5xl font-bold border transition-colors overflow-hidden shadow-[0_1px_3px_rgba(15,23,42,0.08)] ${(profile.name === ADMIN_PROFILE) ? 'bg-red-50/80 border-red-200 group-hover:border-red-300'
                                : profile.archived ? 'bg-slate-50 border-slate-200' : 'bg-white border-slate-200 group-hover:border-slate-300'
                                }`}>
                                {avatars[profile.name] ? <img src={avatars[profile.name]} alt={profile.name} className="w-full h-full object-cover" /> :
                                    (profile.name === ADMIN_PROFILE) ? <Lock className="w-12 h-12 text-red-500" /> :
                                        <span className="text-slate-700">{profile.name[0].toUpperCase()}</span>}
                            </div>
                            <div className="flex flex-col items-center gap-1">
                                <span className="text-xl text-slate-600 group-hover:text-slate-900 transition-colors">{profile.name}</span>
                                {profile.archived && (
                                    <span className="text-xs uppercase tracking-wide text-amber-600 font-semibold">Archived</span>
                                )}
                            </div>
                            <div className={`absolute top-2 right-2 flex gap-2 transition-all ${isManaging ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingProfile(profile.name);
                                        setEditName(profile.name);
                                    }}
                                    className="p-2 bg-white border border-slate-200 hover:border-slate-300 rounded-full text-slate-500 hover:text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.06)]"
                                    title="Edit Profile"
                                >
                                    <Pencil className="w-4 h-4" />
                                </button>
                                {profile.archived ? (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onRestore(profile.name);
                                        }}
                                        className="p-2 bg-white border border-slate-200 hover:border-emerald-200 rounded-full text-slate-500 hover:text-emerald-600 shadow-[0_1px_2px_rgba(15,23,42,0.06)]"
                                        title="Restore Profile"
                                    >
                                        <RotateCcw className="w-4 h-4" />
                                    </button>
                                ) : profile.name !== ADMIN_PROFILE && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (confirm(`Archive profile "${profile.name}"?`)) onDelete(profile.name);
                                        }}
                                        className="p-2 bg-white border border-slate-200 hover:border-red-200 rounded-full text-slate-500 hover:text-red-500 shadow-[0_1px_2px_rgba(15,23,42,0.06)]"
                                        title="Archive Profile"
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
                            onClick={() => {
                                setAdminAction('add');
                                setPassword('');
                                setShowPassword(false);
                                setShowPasswordModal(true);
                            }}
                            className="group flex flex-col items-center gap-4"
                        >
                            <div className="w-28 h-28 md:w-36 md:h-36 rounded-2xl flex items-center justify-center border border-slate-200 hover:border-slate-300 transition-colors bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
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

                    <div className="mt-10 flex items-center gap-3 rounded-full border border-slate-100 bg-white/80 px-5 py-2.5 text-sm text-slate-600 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                    <input
                        id="remember-profile"
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="h-4 w-4 accent-slate-900"
                    />
                    <label htmlFor="remember-profile" className="font-semibold cursor-pointer">
                        Remember me on this device
                    </label>
                </div>

                {/* Admin Password Modal */}
                {showPasswordModal && (
                    <div className="fixed inset-0 bg-slate-900/40 z-[60] flex items-center justify-center p-4">
                        <div className="bg-white p-8 rounded-2xl border border-slate-100 w-full max-w-sm text-center relative shadow-[0_8px_24px_rgba(15,23,42,0.12)]">
                            <button onClick={() => { setShowPasswordModal(false); setAdminAction(null); setPendingProfile(null); }} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"><Plus className="rotate-45" /></button>
                            <h2 className="text-2xl font-bold mb-6 text-slate-900">Enter {ADMIN_PROFILE} Password</h2>

                            <div className="relative mb-6">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    autoFocus
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    className="w-full bg-white border border-slate-200 rounded-2xl p-4 text-center text-xl focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10 outline-none text-slate-700 pr-12"
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
                                    className="h-4 w-4 accent-slate-900"
                                />
                                Remember me on this device
                            </label>

                            <button onClick={confirmPassword} className="w-full py-3 rounded-xl bg-slate-900 text-white font-bold hover:bg-slate-800">
                                Login
                            </button>
                        </div>
                    </div>
                )}

                {editingProfile && (
                    <div className="fixed inset-0 bg-slate-900/40 z-[70] flex items-center justify-center p-4">
                        <div className="bg-white p-8 rounded-2xl border border-slate-100 w-full max-w-md text-center relative shadow-[0_8px_24px_rgba(15,23,42,0.12)]">
                            <button onClick={() => setEditingProfile(null)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"><X className="w-6 h-6" /></button>
                            <h2 className="text-2xl font-bold mb-6 text-slate-900">Edit Profile</h2>

                            {/* Avatar Upload */}
                            <div className="relative w-24 h-24 mx-auto mb-6 group">
                                <div className="w-full h-full rounded-full overflow-hidden border border-slate-200 bg-white flex items-center justify-center shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
                                    {avatars[editingProfile] ? (
                                        <img src={avatars[editingProfile]} alt="Avatar" className="w-full h-full object-cover" />
                                    ) : (
                                        <span className="text-4xl text-slate-400">{editingProfile[0]}</span>
                                    )}
                                </div>
                                <label className="absolute bottom-0 right-0 p-2 bg-slate-900 rounded-full cursor-pointer hover:bg-slate-800 transition-colors shadow-lg">
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
                                className="w-full bg-white border border-slate-200 rounded-2xl p-4 text-center text-xl mb-6 focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10 outline-none text-slate-700"
                                onKeyDown={e => e.key === 'Enter' && handleEditSave()}
                            />

                            <div className="flex gap-4">
                                <button onClick={handleDelete} className="px-6 py-3 rounded-xl bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 flex items-center gap-2">
                                    <Trash2 className="w-5 h-5" /> Delete
                                </button>
                                <button onClick={handleEditSave} className="flex-1 py-3 rounded-xl bg-slate-900 text-white font-bold hover:bg-slate-800">
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
