'use client';

import { CarSale } from '@/src/types';

export const applyShitblerjeOverrides = (sale: CarSale): CarSale => {
    const overrides = sale.shitblerjeOverrides;
    if (!overrides) return sale;
    const cleanedOverrides = Object.fromEntries(
        Object.entries(overrides).filter(([, value]) => value !== undefined)
    );
    return {
        ...sale,
        ...cleanedOverrides
    };
};
