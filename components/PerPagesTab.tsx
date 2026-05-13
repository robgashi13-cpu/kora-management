import React, { useEffect, useState, useRef } from 'react';
import { Upload, FileText, Trash2, Download, Loader2, Plus } from 'lucide-react';
import { cloudClient as supabase } from '@/services/cloudAuth';

interface PerPagesUpload {
    id: string;
    file_name: string;
    file_path: string;
    file_url: string;
    file_size: number | null;
    mime_type: string | null;
    notes: string | null;
    uploaded_by: string | null;
    uploaded_at: string;
}

interface Props {
    userProfile: string | null;
}

const formatDate = (iso: string) => {
    try {
        const d = new Date(iso);
        return d.toLocaleString(undefined, {
            year: 'numeric', month: 'short', day: '2-digit',
            hour: '2-digit', minute: '2-digit',
        });
    } catch { return iso; }
};

const formatSize = (bytes: number | null) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export default function PerPagesTab({ userProfile }: Props) {
    const [items, setItems] = useState<PerPagesUpload[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [notes, setNotes] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const load = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('per_pages_uploads' as any)
            .select('*')
            .order('uploaded_at', { ascending: false });
        if (!error && data) setItems(data as any);
        setLoading(false);
    };

    useEffect(() => { load(); }, []);

    const handleUpload = async (files: FileList | null) => {
        if (!files || files.length === 0) return;
        setUploading(true);
        try {
            for (const file of Array.from(files)) {
                const ext = file.name.split('.').pop() || 'bin';
                const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
                const { error: upErr } = await supabase.storage
                    .from('per-pages')
                    .upload(path, file, { contentType: file.type, upsert: false });
                if (upErr) { console.error(upErr); continue; }
                const { data: pub } = supabase.storage.from('per-pages').getPublicUrl(path);
                await supabase.from('per_pages_uploads' as any).insert({
                    file_name: file.name,
                    file_path: path,
                    file_url: pub.publicUrl,
                    file_size: file.size,
                    mime_type: file.type,
                    notes: notes.trim() || null,
                    uploaded_by: userProfile || 'unknown',
                });
            }
            setNotes('');
            if (fileInputRef.current) fileInputRef.current.value = '';
            await load();
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = async (item: PerPagesUpload) => {
        if (!confirm(`Delete "${item.file_name}"?`)) return;
        await supabase.storage.from('per-pages').remove([item.file_path]);
        await supabase.from('per_pages_uploads' as any).delete().eq('id', item.id);
        await load();
    };

    return (
        <div className="flex-1 min-h-0 flex flex-col gap-4 p-4 pb-[calc(5rem+env(safe-area-inset-bottom))] md:p-6 md:pb-6 overflow-auto">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 md:p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-5 h-5 text-slate-700" />
                    <h2 className="text-lg font-bold text-slate-900">Për Pages — Unpaid Invoices</h2>
                </div>
                <p className="text-xs text-slate-500 mb-4">Upload unpaid invoice documents. Each file shows the time it was uploaded.</p>

                <div className="grid gap-3 md:grid-cols-[1fr_auto] items-start">
                    <input
                        type="text"
                        placeholder="Optional note (e.g. supplier, reference)…"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10"
                    />
                    <div className="flex items-center gap-2">
                        <input
                            ref={fileInputRef}
                            type="file"
                            multiple
                            className="hidden"
                            onChange={(e) => handleUpload(e.target.files)}
                        />
                        <button
                            type="button"
                            disabled={uploading}
                            onClick={() => fileInputRef.current?.click()}
                            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 active:scale-[0.98] transition disabled:opacity-60"
                        >
                            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                            {uploading ? 'Uploading…' : 'Upload File'}
                        </button>
                    </div>
                </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-4 md:px-6 py-3 border-b border-slate-100 bg-slate-50">
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Uploaded files</div>
                    <div className="text-xs text-slate-500">{items.length} total</div>
                </div>
                {loading ? (
                    <div className="p-8 text-center text-sm text-slate-500 flex items-center justify-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" /> Loading…
                    </div>
                ) : items.length === 0 ? (
                    <div className="p-10 text-center text-sm text-slate-400 flex flex-col items-center gap-2">
                        <Plus className="w-6 h-6 opacity-50" />
                        No uploads yet. Add your first unpaid invoice above.
                    </div>
                ) : (
                    <ul className="divide-y divide-slate-100">
                        {items.map((it) => (
                            <li key={it.id} className="flex items-center gap-3 px-4 md:px-6 py-3 hover:bg-slate-50">
                                <div className="w-9 h-9 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center flex-shrink-0">
                                    <FileText className="w-4 h-4 text-slate-600" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="text-sm font-semibold text-slate-900 truncate">{it.file_name}</div>
                                    <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                        <span>Uploaded {formatDate(it.uploaded_at)}</span>
                                        {it.uploaded_by && <span>· by <span className="font-semibold text-slate-700">{it.uploaded_by}</span></span>}
                                        {it.file_size ? <span>· {formatSize(it.file_size)}</span> : null}
                                    </div>
                                    {it.notes && <div className="text-[11px] text-slate-500 mt-0.5 italic truncate">{it.notes}</div>}
                                </div>
                                <a
                                    href={it.file_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    download={it.file_name}
                                    className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100"
                                    title="Open / Download"
                                >
                                    <Download className="w-4 h-4" />
                                </a>
                                <button
                                    onClick={() => handleDelete(it)}
                                    className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-slate-200 text-red-500 hover:bg-red-50 hover:border-red-200"
                                    title="Delete"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
