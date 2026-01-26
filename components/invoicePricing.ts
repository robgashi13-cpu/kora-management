import { CarSale } from '@/app/types';

export type InvoicePriceSource = 'sold' | 'paid_bank';

export const resolveInvoicePriceValue = (
  sale: Partial<CarSale>,
  source: InvoicePriceSource | null | undefined,
  overrideValue?: number
) => {
  if (typeof overrideValue === 'number' && Number.isFinite(overrideValue)) {
    return overrideValue;
  }
  if (source === 'paid_bank') {
    return Number(sale.amountPaidBank ?? 0) || 0;
  }
  return Number(sale.soldPrice ?? 0) || 0;
};

export const getInvoicePriceLabel = (source?: InvoicePriceSource | null) => {
  if (source === 'paid_bank') return 'Paid in bank price';
  return 'Sold price';
};
