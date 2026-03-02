export type InvoiceSourceContext = 'edit_shitblerje' | 'edit_sale' | 'add_sale' | 'invoices_tab' | 'unknown';

export interface InvoiceHistoryEntry {
  id: string;
  invoiceId: string;
  sourceContext: InvoiceSourceContext;
  relatedEntityType: 'sale' | 'shitblerje' | 'car';
  relatedEntityId: string;
  carDisplay: string;
  vin?: string;
  stock?: string;
  createdByUserId: string;
  createdByDisplay: string;
  createdAt: string;
  invoiceViewRef: string;
  pdfFileRef?: string;
}

export const createInvoiceHistoryEntry = ({ sale, sourceContext, createdBy }: {
  sale: { id: string; brand: string; model: string; vin?: string; plateNumber?: string; invoiceId?: string };
  sourceContext: InvoiceSourceContext;
  createdBy: string;
}): InvoiceHistoryEntry => {
  const now = new Date().toISOString();
  const invoiceId = sale.invoiceId || `${sale.id}-${now}`;
  return {
    id: `${sale.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    invoiceId,
    sourceContext,
    relatedEntityType: sourceContext === 'edit_shitblerje' ? 'shitblerje' : 'sale',
    relatedEntityId: sale.id,
    carDisplay: `${sale.brand} ${sale.model}`.trim(),
    vin: sale.vin,
    stock: sale.plateNumber,
    createdByUserId: createdBy,
    createdByDisplay: createdBy,
    createdAt: now,
    invoiceViewRef: sale.id,
  };
};

export const groupInvoiceHistoryByMonth = (entries: InvoiceHistoryEntry[]) => {
  const sorted = [...entries].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return sorted.reduce<Record<string, InvoiceHistoryEntry[]>>((acc, entry) => {
    const dt = new Date(entry.createdAt);
    const monthKey = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
    if (!acc[monthKey]) acc[monthKey] = [];
    acc[monthKey].push(entry);
    return acc;
  }, {});
};

export const formatInvoiceMonthLabel = (monthKey: string) => {
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
};
