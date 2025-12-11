'use client';

import React, { useState, useEffect } from 'react';
import { Upload, FileText, Loader2, AlertCircle } from 'lucide-react';
import { analyzeBankStatement } from '@/services/openaiService';
import { Preferences } from '@capacitor/preferences';

export default function BankStatementView({
    apiKey,
    transactions,
    setTransactions,
    analyzing,
    setAnalyzing,
    saveTransactions
}: {
    apiKey: string,
    transactions: any[],
    setTransactions: (txs: any[]) => void,
    analyzing: boolean,
    setAnalyzing: (val: boolean) => void,
    saveTransactions: (txs: any[]) => void
}) {
    // Local state moved to parent (Dashboard)
    const [error, setError] = useState('');


    // handleFileUpload (Simplified, uses Parent State)
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!apiKey) {
            setError('Please enter your Gemini API Key in Settings first.');
            return;
        }

        if (file.type !== 'application/pdf') {
            setError('Please upload a PDF file.');
            return;
        }

        try {
            setAnalyzing(true);
            setError('');

            // Convert to Base64
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = async () => {
                const base64Content = (reader.result as string).split(',')[1];

                try {
                    const results = await analyzeBankStatement(apiKey, base64Content);
                    // Ensure results is an array
                    // @ts-ignore
                    const txList = Array.isArray(results) ? results : (results.transactions || []);
                    saveTransactions(txList);
                } catch (err) {
                    setError('Failed to analyze PDF. Ensure it is a valid bank statement.');
                    console.error(err);
                } finally {
                    setAnalyzing(false);
                }
            };
        } catch (err) {
            setError('File reading failed.');
            setAnalyzing(false);
        }
    };

    return (
        <div className="p-6 text-white min-h-full pb-20">
            <div className="bg-[#1a1a1a] border border-white/10 rounded-xl p-8 mb-8 text-center border-dashed">
                <input
                    type="file"
                    id="bank-upload"
                    accept="application/pdf"
                    className="hidden"
                    onChange={handleFileUpload}
                    disabled={analyzing}
                />
                <label
                    htmlFor="bank-upload"
                    className={`cursor-pointer flex flex-col items-center gap-4 ${analyzing ? 'opacity-50 pointer-events-none' : 'hover:scale-105 transition-transform'}`}
                >
                    <div className="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-400">
                        {analyzing ? <Loader2 className="w-8 h-8 animate-spin" /> : <Upload className="w-8 h-8" />}
                    </div>
                    <div>
                        <h3 className="text-xl font-bold">{analyzing ? 'OpenAI is Analyzing...' : 'Upload Bank Statement (PDF)'}</h3>
                        <p className="text-gray-500 mt-2 text-sm">{analyzing ? 'Reading transactions & categorizing...' : 'AI will automatically extract and categorize transactions'}</p>
                    </div>
                </label>
            </div>

            {error && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-lg mb-6 flex items-center gap-2">
                    <AlertCircle className="w-5 h-5" />
                    {error}
                </div>
            )}

            {transactions.length > 0 && (
                <div className="bg-[#1a1a1a] border border-white/10 rounded-xl overflow-hidden">
                    <div className="p-4 bg-[#202020] border-b border-white/10 flex justify-between items-center">
                        <h3 className="font-bold flex items-center gap-2"><FileText className="w-4 h-4 text-blue-400" /> Extracted Transactions</h3>
                        <span className="text-sm text-gray-500">{transactions.length} items found</span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-[#161616] text-gray-400 uppercase text-xs font-semibold">
                                <tr>
                                    <th className="p-4">Date</th>
                                    <th className="p-4">Description</th>
                                    <th className="p-4">Category</th>
                                    <th className="p-4 text-right">Amount</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {transactions.map((tx, idx) => (
                                    <tr key={idx} className="hover:bg-white/5 transition-colors">
                                        <td className="p-4 font-mono text-gray-300">{tx.date}</td>
                                        <td className="p-4 text-white font-medium">{tx.description}</td>
                                        <td className="p-4">
                                            <span className="px-2 py-1 rounded-full bg-white/5 text-xs border border-white/5 text-gray-300">
                                                {tx.category}
                                            </span>
                                        </td>
                                        <td className={`p-4 text-right font-mono font-bold ${tx.amount > 0 ? 'text-green-400' : 'text-white'}`}>
                                            {tx.amount > 0 ? '+' : ''}{tx.amount}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
