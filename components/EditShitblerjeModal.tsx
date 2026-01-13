'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { CarSale, ShitblerjeOverrides } from '@/app/types';
import { motion } from 'framer-motion';

interface Props {
    isOpen: boolean;
    sale: CarSale | null;
    onClose: () => void;
    onSave: (overrides: ShitblerjeOverrides) => Promise<void>;
}

const YEARS = Array.from({ length: 26 }, (_, i) => 2000 + i).reverse();
const COLORS = [
    'Black', 'White', 'Silver', 'Grey', 'Blue', 'Red', 'Green', 'Brown', 'Beige', 'Gold', 'Yellow', 'Orange', 'Purple', 'Other'
];

export default function EditShitblerjeModal({ isOpen, sale, onClose, onSave }: Props) {
    const [formData, setFormData] = useState<ShitblerjeOverrides>({});
    const [isSaving, setIsSaving] = useState(false);

    const baseValues = useMemo(() => {
        if (!sale) return null;
        return {
            brand: sale.shitblerjeOverrides?.brand ?? sale.brand ?? '',
            model: sale.shitblerjeOverrides?.model ?? sale.model ?? '',
            year: sale.shitblerjeOverrides?.year ?? sale.year ?? new Date().getFullYear(),
            km: sale.shitblerjeOverrides?.km ?? sale.km ?? 0,
            color: sale.shitblerjeOverrides?.color ?? sale.color ?? '',
            plateNumber: sale.shitblerjeOverrides?.plateNumber ?? sale.plateNumber ?? '',
            vin: sale.shitblerjeOverrides?.vin ?? sale.vin ?? '',
            soldPrice: sale.shitblerjeOverrides?.soldPrice ?? sale.soldPrice ?? 0
        };
    }, [sale]);

    useEffect(() => {
        if (isOpen && baseValues) {
            setFormData(baseValues);
        }
    }, [isOpen, baseValues]);

    if (!isOpen || !sale) return null;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        const numericValue = value === '' ? 0 : Number(value);
        setFormData(prev => ({
            ...prev,
            [name]: Number.isNaN(numericValue) ? 0 : numericValue
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            await onSave({
                ...formData,
                year: Number(formData.year || 0),
                km: Number(formData.km || 0),
                soldPrice: Number(formData.soldPrice || 0)
            });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 overflow-y-auto">
            <motion.div
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.15 }}
                className="w-full max-w-2xl max-h-[90vh] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col my-auto"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
                    <div>
                        <h2 className="text-lg font-bold text-slate-900">Edit Shitblerje</h2>
                        <p className="text-xs text-slate-500">Only affects Shitblerje + Invoice PDFs.</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-full hover:bg-slate-100 text-slate-500 hover:text-slate-700"
                        aria-label="Close"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="p-5 space-y-5 overflow-y-auto flex-1" style={{ WebkitOverflowScrolling: 'touch' }}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input label="Brand" name="brand" value={formData.brand ?? ''} onChange={handleChange} required />
                        <Input label="Model" name="model" value={formData.model ?? ''} onChange={handleChange} required />
                        <Select label="Year" name="year" value={formData.year ?? new Date().getFullYear()} onChange={handleNumberChange}>
                            {YEARS.map(year => (
                                <option key={year} value={year}>{year}</option>
                            ))}
                        </Select>
                        <Select label="Color" name="color" value={formData.color ?? ''} onChange={handleChange}>
                            <option value="">Select</option>
                            {COLORS.map(color => (
                                <option key={color} value={color}>{color}</option>
                            ))}
                        </Select>
                        <Input label="KM" name="km" type="number" value={formData.km ?? 0} onChange={handleNumberChange} />
                        <Input label="VIN" name="vin" value={formData.vin ?? ''} onChange={handleChange} />
                        <Input label="License Plate" name="plateNumber" value={formData.plateNumber ?? ''} onChange={handleChange} />
                        <Input label="Sold Price (€)" name="soldPrice" type="number" value={formData.soldPrice ?? 0} onChange={handleNumberChange} required />
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 justify-end pt-2 border-t border-slate-100">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSaving}
                            className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-60"
                        >
                            {isSaving ? 'Saving...' : 'Save Shitblerje'}
                        </button>
                    </div>
                </form>
            </motion.div>
        </div>
    );
}

const Input = ({ label, className = '', required, ...props }: any) => (
    <div className={`flex flex-col gap-1.5 w-full ${className}`}>
        <label className="text-[13px] font-semibold text-slate-700 flex items-center gap-1">
            {label}
            {!required && <span className="text-[11px] font-medium text-slate-400">(Optional)</span>}
        </label>
        <input
            className="bg-white border border-slate-200 hover:border-slate-300 focus:border-slate-400 rounded-xl px-3 text-sm text-slate-900 leading-6 focus:ring-2 focus:ring-slate-900/10 outline-none transition-all placeholder:text-slate-400 w-full h-10"
            required={required}
            {...props}
        />
    </div>
);

const Select = ({ label, children, required, ...props }: any) => (
    <div className="flex flex-col gap-1.5 w-full">
        <label className="text-[13px] font-semibold text-slate-700 flex items-center gap-1">
            {label}
            {!required && <span className="text-[11px] font-medium text-slate-400">(Optional)</span>}
        </label>
        <select
            className="bg-white border border-slate-200 hover:border-slate-300 focus:border-slate-400 rounded-xl px-3 text-sm text-slate-900 leading-6 focus:ring-2 focus:ring-slate-900/10 outline-none transition-all w-full h-10 cursor-pointer"
            required={required}
            {...props}
        >
            {children}
        </select>
    </div>
);
