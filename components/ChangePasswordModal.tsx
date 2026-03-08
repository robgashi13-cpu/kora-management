import React, { useState } from 'react';
import { X, Eye, EyeOff, Loader2, Lock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { changePassword } from '@/services/authService';

interface ChangePasswordModalProps {
    isOpen: boolean;
    onClose: () => void;
    profileName: string;
}

export default function ChangePasswordModal({ isOpen, onClose, profileName }: ChangePasswordModalProps) {
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    const handleSubmit = async () => {
        setError('');
        if (newPassword.length < 6) {
            setError('Password must be at least 6 characters');
            return;
        }
        if (newPassword !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        setIsLoading(true);
        try {
            const result = await changePassword(newPassword);
            if (result.success) {
                setSuccess(true);
                setTimeout(() => {
                    onClose();
                    setSuccess(false);
                    setNewPassword('');
                    setConfirmPassword('');
                }, 1500);
            } else {
                setError(result.error || 'Failed to change password');
            }
        } catch (err: any) {
            setError(err.message || 'An error occurred');
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" onClick={onClose}>
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    onClick={e => e.stopPropagation()}
                    className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl"
                >
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-2">
                            <Lock className="w-5 h-5 text-slate-600" />
                            <h3 className="text-lg font-bold text-slate-900">Change Password</h3>
                        </div>
                        <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <p className="text-sm text-slate-500 mb-4">Changing password for <strong>{profileName}</strong></p>

                    {success ? (
                        <div className="text-center py-6">
                            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                                <Lock className="w-6 h-6 text-green-600" />
                            </div>
                            <p className="text-green-700 font-semibold">Password changed successfully!</p>
                        </div>
                    ) : (
                        <>
                            <div className="space-y-3 mb-4">
                                <div className="relative">
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        value={newPassword}
                                        onChange={e => { setNewPassword(e.target.value); setError(''); }}
                                        placeholder="New password"
                                        className="w-full border border-slate-200 rounded-xl p-3 pr-10 text-sm focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10 outline-none"
                                    />
                                    <button
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                                    >
                                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={confirmPassword}
                                    onChange={e => { setConfirmPassword(e.target.value); setError(''); }}
                                    placeholder="Confirm new password"
                                    className="w-full border border-slate-200 rounded-xl p-3 text-sm focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10 outline-none"
                                    onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                                />
                            </div>

                            {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

                            <button
                                onClick={handleSubmit}
                                disabled={isLoading || !newPassword || !confirmPassword}
                                className="w-full py-3 rounded-xl bg-slate-900 text-white font-bold hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                            >
                                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Update Password'}
                            </button>
                        </>
                    )}
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
