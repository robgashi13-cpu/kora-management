'use client';

import React from 'react';

export type PdfTemplateType = 'full_shitblerje' | 'deposit' | 'full_marreveshje' | 'invoice';

export type PdfTemplateEntry = {
  id: PdfTemplateType;
  title: string;
  body: string;
  updatedAt: string;
};

export type PdfTemplateMap = Record<PdfTemplateType, PdfTemplateEntry>;

export const PDF_TEMPLATE_DEFINITIONS: Array<{ id: PdfTemplateType; label: string; description: string }> = [
  { id: 'full_shitblerje', label: 'Kontrata e shitblerjes', description: 'Kontrata kryesore e shitblerjes.' },
  { id: 'deposit', label: 'Deposite', description: 'Marrëveshje për kapar/depozitë.' },
  { id: 'full_marreveshje', label: 'Marveshje interne', description: 'Marrëveshje e brendshme.' },
  { id: 'invoice', label: 'Fatura', description: 'Fatura standarde e shitjes.' },
];

export const defaultPdfTemplates = (): PdfTemplateMap => ({
  full_shitblerje: {
    id: 'full_shitblerje',
    title: 'Kontrata e shitblerjes',
    body: 'Kontrata e shitblerjes\n\nKy tekst është template-i bazë për dokumentin. Çdo ndryshim këtu reflektohet në Documents të Add/Edit Sale dhe te butoni Documents i veturës.',
    updatedAt: new Date(0).toISOString(),
  },
  deposit: {
    id: 'deposit',
    title: 'Deposite',
    body: 'Deposite\n\nKy template kontrollon tekstin shtesë të kontratës së kaparit.',
    updatedAt: new Date(0).toISOString(),
  },
  full_marreveshje: {
    id: 'full_marreveshje',
    title: 'Marveshje interne',
    body: 'Marveshje interne\n\nKy template kontrollon tekstin shtesë të marrëveshjes interne.',
    updatedAt: new Date(0).toISOString(),
  },
  invoice: {
    id: 'invoice',
    title: 'Fatura',
    body: 'Fatura\n\nKy template kontrollon tekstin shtesë të faturës.',
    updatedAt: new Date(0).toISOString(),
  },
});

type Props = {
  templates: PdfTemplateMap;
  onChange: (next: PdfTemplateMap) => void;
  onSave: () => Promise<void>;
  onAutoSave?: () => void;
  saving: boolean;
};

export default function PdfTemplateBuilder({ templates, onChange, onSave, onAutoSave, saving }: Props) {
  const [active, setActive] = React.useState<PdfTemplateType>('full_shitblerje');
  const activeTemplate = templates[active];

  React.useEffect(() => {
    if (!onAutoSave) return;
    const timer = window.setTimeout(() => onAutoSave(), 500);
    return () => window.clearTimeout(timer);
  }, [templates, onAutoSave]);

  return (
    <div className="p-6 space-y-4">
      <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-5 shadow-sm">
        <h2 className="text-2xl font-black text-slate-900">PDF Templates</h2>
        <p className="text-sm text-slate-600 mt-1">Single source of truth for all Documents buttons (Add Sale / Edit Sale / Car row).</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-3 space-y-2">
          {PDF_TEMPLATE_DEFINITIONS.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => setActive(template.id)}
              className={`w-full text-left px-3 py-3 rounded-xl text-sm transition-all ${active === template.id ? 'bg-slate-900 text-white shadow-md' : 'hover:bg-slate-100 text-slate-700'}`}
            >
              <div className="font-bold">{templates[template.id].title || template.label}</div>
              <div className={`text-xs mt-1 ${active === template.id ? 'text-slate-200' : 'text-slate-500'}`}>{template.description}</div>
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
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-semibold"
            placeholder="Template title"
          />

          <div className="rounded-xl border border-slate-300 p-3 bg-slate-50">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Editable template text (click + type)</div>
            <textarea
              value={activeTemplate.body}
              onChange={(e) => onChange({
                ...templates,
                [active]: { ...activeTemplate, body: e.target.value, updatedAt: new Date().toISOString() },
              })}
              className="w-full min-h-[380px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              placeholder="Edit all template text"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void onSave()}
              disabled={saving}
              className="rounded-xl bg-slate-900 text-white px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save now'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
