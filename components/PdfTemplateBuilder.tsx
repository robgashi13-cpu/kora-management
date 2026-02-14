'use client';

import React from 'react';

export type PdfTemplateType = 'full_shitblerje' | 'deposit' | 'full_marreveshje' | 'invoice';

export type PdfTemplateEntry = {
  id: string;
  title: string;
  body: string;
  updatedAt: string;
};

export type PdfTemplateMap = Record<PdfTemplateType, PdfTemplateEntry>;

export const defaultPdfTemplates = (): PdfTemplateMap => ({
  full_shitblerje: {
    id: 'full_shitblerje',
    title: 'Kontrata e shitblerjes',
    body: 'Titulli i dokumentit\n\nKy tekst është i editueshëm. Fushat e shitjes do të vendosen gjatë gjenerimit të PDF-së.',
    updatedAt: new Date(0).toISOString(),
  },
  deposit: {
    id: 'deposit',
    title: 'Deposite',
    body: 'Titulli i dokumentit\n\nKy tekst është i editueshëm. Fushat e shitjes do të vendosen gjatë gjenerimit të PDF-së.',
    updatedAt: new Date(0).toISOString(),
  },
  full_marreveshje: {
    id: 'full_marreveshje',
    title: 'Marveshje interne',
    body: 'Titulli i dokumentit\n\nKy tekst është i editueshëm. Fushat e shitjes do të vendosen gjatë gjenerimit të PDF-së.',
    updatedAt: new Date(0).toISOString(),
  },
  invoice: {
    id: 'invoice',
    title: 'Fatura',
    body: 'Titulli i dokumentit\n\nKy tekst është i editueshëm. Fushat e shitjes do të vendosen gjatë gjenerimit të PDF-së.',
    updatedAt: new Date(0).toISOString(),
  },
});

const templateOrder: PdfTemplateType[] = ['full_shitblerje', 'deposit', 'full_marreveshje', 'invoice'];

type Props = {
  templates: PdfTemplateMap;
  onChange: (next: PdfTemplateMap) => void;
  onSave: () => Promise<void>;
  saving: boolean;
};

export default function PdfTemplateBuilder({ templates, onChange, onSave, saving }: Props) {
  const [active, setActive] = React.useState<PdfTemplateType>('full_shitblerje');

  const activeTemplate = templates[active];

  return (
    <div className="p-6 space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-xl font-bold text-slate-900">PDF Templates</h2>
        <p className="text-sm text-slate-600 mt-1">Edit empty templates for Kontrata e shitblerjes, Deposite, Marveshje interne, and Fatura.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-3 space-y-2">
          {templateOrder.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setActive(key)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm ${active === key ? 'bg-slate-900 text-white' : 'hover:bg-slate-100 text-slate-700'}`}
            >
              {templates[key].title}
            </button>
          ))}
        </div>

        <div className="lg:col-span-3 rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
          <input
            value={activeTemplate.title}
            onChange={(e) => onChange({
              ...templates,
              [active]: { ...activeTemplate, title: e.target.value, updatedAt: new Date().toISOString() },
            })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="Template title"
          />
          <textarea
            value={activeTemplate.body}
            onChange={(e) => onChange({
              ...templates,
              [active]: { ...activeTemplate, body: e.target.value, updatedAt: new Date().toISOString() },
            })}
            className="w-full min-h-[360px] rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
            placeholder="Edit template text"
          />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void onSave()}
              disabled={saving}
              className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save template changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
