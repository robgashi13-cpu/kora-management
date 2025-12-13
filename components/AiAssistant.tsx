'use client';

import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, Send, X, Bot, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { chatWithData } from '@/services/openaiService';

interface Message {
    role: 'user' | 'assistant';
    content: string;
}

export default function AiAssistant({ data, apiKey }: { data: any, apiKey: string }) {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([
        { role: 'assistant', content: 'Hi! I\'m KORAUTO AI. Ask me anything about your car sales, profits, or inventory.' }
    ]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isOpen]);

    const handleSend = async () => {
        if (!input.trim() || !apiKey) return;

        const userMsg = input;
        setInput('');
        setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
        setLoading(true);

        try {
            const response = await chatWithData(apiKey, userMsg, data);
            setMessages(prev => [...prev, { role: 'assistant', content: response }]);
        } catch (e: any) {
            setMessages(prev => [...prev, { role: 'assistant', content: e.message || 'Sorry, I encountered an error connecting to OpenAI.' }]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            {/* Floating Button */}
            <button
                onClick={() => setIsOpen(true)}
                className={`fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom))] right-6 p-4 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-2xl hover:scale-110 transition-transform z-[60] ${isOpen ? 'hidden' : 'flex'}`}
            >
                <Sparkles className="w-6 h-6 animate-pulse" />
            </button>

            {/* Chat Window */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 50, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 50, scale: 0.9 }}
                        className="fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom))] right-6 w-[calc(100vw-3rem)] sm:w-96 h-[600px] max-h-[80vh] bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl z-[60] flex flex-col overflow-hidden"
                    >
                        {/* Header */}
                        <div className="p-4 bg-gradient-to-r from-blue-900/50 to-purple-900/50 border-b border-white/10 flex justify-between items-center backdrop-blur-md">
                            <div className="flex items-center gap-2">
                                <Bot className="w-5 h-5 text-blue-400" />
                                <span className="font-bold text-white">KORAUTO AI</span>
                            </div>
                            <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-white">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#111111]" ref={scrollRef}>
                            {messages.map((m, i) => (
                                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[80%] p-3 rounded-2xl text-sm ${m.role === 'user'
                                        ? 'bg-blue-600 text-white rounded-tr-none'
                                        : 'bg-[#252628] text-gray-200 border border-white/5 rounded-tl-none'
                                        }`}>
                                        {m.content}
                                    </div>
                                </div>
                            ))}
                            {loading && (
                                <div className="flex justify-start">
                                    <div className="bg-[#252628] p-3 rounded-2xl rounded-tl-none border border-white/5 flex gap-1">
                                        <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce delay-0" />
                                        <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce delay-100" />
                                        <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce delay-200" />
                                    </div>
                                </div>
                            )}

                            {!apiKey && (
                                <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 rounded-lg text-xs text-center">
                                    OpenAI API Key missing. Please add it in Settings tab.
                                </div>
                            )}
                        </div>

                        {/* Input */}
                        <div className="p-4 bg-[#1a1a1a] border-t border-white/10">
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                                    placeholder="Ask about sales..."
                                    className="flex-1 bg-[#0a0a0a] border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                                    disabled={loading || !apiKey}
                                />
                                <button
                                    onClick={handleSend}
                                    disabled={loading || !apiKey}
                                    className="p-2 bg-blue-600 text-white rounded-xl hover:bg-blue-500 disabled:opacity-50 transition-colors"
                                >
                                    <Send className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
