import React, { useState, useEffect, useRef } from 'react';
import { Lock, Eye, EyeOff, LogIn, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { signIn, getCurrentSession, getAllProfiles, type AuthProfile } from '@/services/authService';

interface ProfileSelectorProps {
    profiles: { name: string; archived: boolean }[];
    onSelect: (profile: string, remember: boolean) => void;
    onAdd: (name: string, email: string, remember: boolean) => void;
    onDelete: (name: string) => void;
    onEdit: (oldName: string, newName: string) => void;
    onRestore: (name: string) => void;
    avatars: Record<string, string>;
    onEditAvatar: (name: string, base64: string) => void;
    rememberDefault?: boolean;
    verifyAdminPassword: (password: string) => Promise<boolean>;
}

const ADMIN_PROFILE = 'Robert';

const PROFILE_EMAILS: Record<string, string> = {
    'Robert': 'robert@kora.app',
    'ETNIK': 'etnik@kora.app',
    'GENC': 'genc@kora.app',
    'LEONIT': 'leonit@kora.app',
    'RAJMOND': 'rajmond@kora.app',
    'RENAT': 'renat@kora.app',
};

export default function ProfileSelector({ profiles, onSelect, onAdd, onDelete, onEdit, onRestore, avatars, onEditAvatar, rememberDefault = false, verifyAdminPassword }: ProfileSelectorProps) {
    const [selectedProfile, setSelectedProfile] = useState<string | null>(null);
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [rememberMe, setRememberMe] = useState(rememberDefault);
    const [checkingSession, setCheckingSession] = useState(true);

    const passwordRef = useRef<HTMLInputElement>(null);

    // Check for existing session on mount
    useEffect(() => {
        const checkSession = async () => {
            try {
                const session = await getCurrentSession();
                if (session) {
                    onSelect(session.profileName, true);
                }
            } catch {
                // No session, show login
            } finally {
                setCheckingSession(false);
            }
        };
        checkSession();
    }, []);

    const handleProfileClick = (profileName: string) => {
        setSelectedProfile(profileName);
        setPassword('');
        setError('');
        setShowPassword(false);
        setTimeout(() => passwordRef.current?.focus(), 100);
    };

    const handleLogin = async () => {
        if (!selectedProfile || !password) return;

        setIsLoading(true);
        setError('');

        try {
            const email = PROFILE_EMAILS[selectedProfile];
            if (!email) {
                setError('Profile not configured for login');
                setIsLoading(false);
                return;
            }

            const result = await signIn(email, password);

            if (result.success && result.profile) {
                onSelect(result.profile.profileName, rememberMe);
            } else {
                setError(result.error || 'Invalid password');
            }
        } catch (err: any) {
            setError(err.message || 'Login failed');
        } finally {
            setIsLoading(false);
        }
    };

    if (checkingSession) {
        return (
            <div className="fixed inset-0 bg-slate-50 z-50 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
                    <p className="text-slate-500 text-sm">Loading...</p>
                </div>
            </div>
        );
    }

    // Login form for selected profile
    if (selectedProfile) {
        const isAdmin = selectedProfile === ADMIN_PROFILE;
        return (
            <div className="fixed inset-0 bg-slate-50 z-50 overflow-y-auto scroll-container">
                <div className="min-h-full flex flex-col items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="w-full max-w-sm"
                    >
                        <button
                            onClick={() => setSelectedProfile(null)}
                            className="mb-8 text-sm text-slate-500 hover:text-slate-700 transition-colors"
                        >
                            ← Back to profiles
                        </button>

                        <div className="bg-white p-8 rounded-2xl border border-slate-100 shadow-[0_8px_24px_rgba(15,23,42,0.12)]">
                            {/* Avatar */}
                            <div className="flex flex-col items-center mb-8">
                                <div className={`w-20 h-20 rounded-2xl flex items-center justify-center text-3xl font-bold border overflow-hidden shadow-sm mb-4 ${isAdmin ? 'bg-red-50/80 border-red-200' : 'bg-white border-slate-200'}`}>
                                    {avatars[selectedProfile] ? (
                                        <img src={avatars[selectedProfile]} alt={selectedProfile} className="w-full h-full object-cover" />
                                    ) : isAdmin ? (
                                        <Lock className="w-8 h-8 text-red-500" />
                                    ) : (
                                        <span className="text-slate-700">{selectedProfile[0]?.toUpperCase()}</span>
                                    )}
                                </div>
                                <h2 className="text-2xl font-bold text-slate-900">{selectedProfile}</h2>
                                <p className="text-sm text-slate-400 mt-1">{PROFILE_EMAILS[selectedProfile]}</p>
                            </div>

                            {/* Password Field */}
                            <div className="relative mb-4">
                                <input
                                    ref={passwordRef}
                                    type={showPassword ? 'text' : 'password'}
                                    autoFocus
                                    value={password}
                                    onChange={e => { setPassword(e.target.value); setError(''); }}
                                    className="w-full bg-white border border-slate-200 rounded-xl p-4 text-center text-lg focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10 outline-none text-slate-700 pr-12"
                                    placeholder="Enter password"
                                    onKeyDown={e => e.key === 'Enter' && handleLogin()}
                                />
                                <button
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                >
                                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                </button>
                            </div>

                            {error && (
                                <p className="text-red-500 text-sm text-center mb-4">{error}</p>
                            )}

                            <label className="mb-5 flex items-center justify-center gap-3 text-sm text-slate-600 font-semibold">
                                <input
                                    type="checkbox"
                                    checked={rememberMe}
                                    onChange={(e) => setRememberMe(e.target.checked)}
                                    className="h-4 w-4 accent-slate-900"
                                />
                                Remember me on this device
                            </label>

                            <button
                                onClick={handleLogin}
                                disabled={isLoading || !password}
                                className="w-full py-3.5 rounded-xl bg-slate-900 text-white font-bold hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                            >
                                {isLoading ? (
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                ) : (
                                    <>
                                        <LogIn className="w-4 h-4" />
                                        Sign In
                                    </>
                                )}
                            </button>
                        </div>
                    </motion.div>
                </div>
            </div>
        );
    }

    // Profile selection grid
    return (
        <div className="fixed inset-0 bg-slate-50 z-50 overflow-y-auto scroll-container">
            <div className="min-h-full flex flex-col items-center justify-center p-4">
                <h1 className="text-4xl md:text-5xl font-bold mb-12 tracking-tight text-slate-900">Who is working?</h1>

                <div className="flex flex-wrap justify-center gap-6 md:gap-8 max-w-4xl">
                    {profiles.filter(p => !p.archived).map(profile => {
                        const isAdmin = profile.name === ADMIN_PROFILE;
                        return (
                            <motion.div
                                key={profile.name}
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => handleProfileClick(profile.name)}
                                className="group flex flex-col items-center gap-4 cursor-pointer"
                            >
                                <div className={`w-28 h-28 md:w-36 md:h-36 rounded-2xl flex items-center justify-center text-5xl font-bold border transition-colors overflow-hidden shadow-[0_1px_3px_rgba(15,23,42,0.08)] ${isAdmin ? 'bg-red-50/80 border-red-200 group-hover:border-red-300' : 'bg-white border-slate-200 group-hover:border-slate-300'}`}>
                                    {avatars[profile.name] ? (
                                        <img src={avatars[profile.name]} alt={profile.name} className="w-full h-full object-cover" />
                                    ) : isAdmin ? (
                                        <Lock className="w-12 h-12 text-red-500" />
                                    ) : (
                                        <span className="text-slate-700">{profile.name[0]?.toUpperCase() || '?'}</span>
                                    )}
                                </div>
                                <div className="flex flex-col items-center gap-1">
                                    <span className="text-xl text-slate-600 group-hover:text-slate-900 transition-colors">{profile.name}</span>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
