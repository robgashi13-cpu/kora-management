import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { CarSale } from '@/app/types';

export const createSupabaseClient = (url: string, key: string): SupabaseClient => {
    return createClient(url, key);
};

// Helper to map Local (camel) to Remote (snake)
// CRITICAL: Every field that exists as a DB column MUST be mapped here to persist correctly
const toRemote = (s: CarSale, userProfile: string) => {
    const payload = {
        id: s.id,
        brand: s.brand,
        model: s.model,
        year: s.year,
        km: s.km,
        color: s.color,
        plate_number: s.plateNumber,
        vin: s.vin,
        seller_name: s.sellerName,
        buyer_name: s.buyerName,
        buyer_personal_id: s.buyerPersonalId, // Now mapped to actual column
        shipping_name: s.shippingName,
        shipping_date: s.shippingDate,
        include_transport: s.includeTransport,
        cost_to_buy: s.costToBuy,
        sold_price: s.soldPrice,
        amount_paid_cash: s.amountPaidCash,
        amount_paid_bank: s.amountPaidBank,
        deposit: s.deposit,
        deposit_date: s.depositDate,
        services_cost: s.servicesCost,
        tax: s.tax,
        amount_paid_by_client: s.amountPaidByClient,
        amount_paid_to_korea: s.amountPaidToKorea,
        paid_date_to_korea: s.paidDateToKorea,
        paid_date_from_client: s.paidDateFromClient,
        payment_method: s.paymentMethod,
        status: s.status,
        sort_order: s.sortOrder,
        // CRITICAL: These fields MUST be mapped to their DB columns for persistence
        group: s.group, // Group assignment - MUST persist to column
        notes: s.notes, // Notes - MUST persist to column
        sold_by: s.soldBy, // Sold by - MUST persist to column
        // Use attachments JSONB for flexible storage and full backup
        attachments: {
            ...s, // Data Redundancy: Save ALL scalar fields and arrays to JSONB to ensure nothing is lost
            soldBy: s.soldBy,
            sellerAudit: s.sellerAudit,
            last_edited_by: userProfile
        },
        last_edited_by: userProfile,
    } as Record<string, unknown>;

    // Filter out undefined values, but KEEP null values (explicit removal)
    return Object.fromEntries(
        Object.entries(payload).filter(([, value]) => value !== undefined)
    );
};

// Helper to map Remote (snake) to Local (camel)
// CRITICAL: Use nullish coalescing (??) to preserve falsy values like 0, false, empty string
// Only fall back to attachments when the column value is null/undefined
const fromRemote = (r: any): CarSale => ({
    id: r.id,
    brand: r.brand ?? r.attachments?.brand,
    model: r.model ?? r.attachments?.model,
    year: r.year ?? r.attachments?.year,
    km: r.km ?? r.attachments?.km,
    color: r.color ?? r.attachments?.color,
    plateNumber: r.plate_number ?? r.attachments?.plateNumber,
    vin: r.vin ?? r.attachments?.vin,
    sellerName: r.seller_name ?? r.attachments?.sellerName,
    buyerName: r.buyer_name ?? r.attachments?.buyerName,
    buyerPersonalId: r.buyer_personal_id ?? r.attachments?.buyerPersonalId,
    shippingName: r.shipping_name ?? r.attachments?.shippingName,
    shippingDate: r.shipping_date ?? r.attachments?.shippingDate,
    includeTransport: r.include_transport ?? r.attachments?.includeTransport,
    costToBuy: r.cost_to_buy ?? r.attachments?.costToBuy,
    soldPrice: r.sold_price ?? r.attachments?.soldPrice,
    amountPaidCash: r.amount_paid_cash ?? r.attachments?.amountPaidCash,
    amountPaidBank: r.amount_paid_bank ?? r.attachments?.amountPaidBank,
    deposit: r.deposit ?? r.attachments?.deposit,
    depositDate: r.deposit_date ?? r.attachments?.depositDate,
    servicesCost: r.services_cost ?? r.attachments?.servicesCost,
    tax: r.tax ?? r.attachments?.tax,
    amountPaidByClient: r.amount_paid_by_client ?? r.attachments?.amountPaidByClient,
    amountPaidToKorea: r.amount_paid_to_korea ?? r.attachments?.amountPaidToKorea,
    paidDateToKorea: r.paid_date_to_korea ?? r.attachments?.paidDateToKorea,
    paidDateFromClient: r.paid_date_from_client ?? r.attachments?.paidDateFromClient,
    isPaid: r.attachments?.isPaid,
    paymentMethod: (r.payment_method ?? r.attachments?.paymentMethod) as any,
    status: (r.status ?? r.attachments?.status) as any,
    sortOrder: r.sort_order ?? r.attachments?.sortOrder,
    
    // CRITICAL: These fields MUST read from columns first, then fallback to attachments
    group: r.group ?? r.attachments?.group, // Group assignment from column
    notes: r.notes ?? r.attachments?.notes, // Notes from column
    soldBy: r.sold_by ?? r.attachments?.soldBy, // Sold by from column
    
    // Extract attachments and extras (only available in attachments)
    bankReceipt: r.attachments?.bankReceipt,
    bankReceipts: r.attachments?.bankReceipts,
    bankInvoice: r.attachments?.bankInvoice,
    bankInvoices: r.attachments?.bankInvoices,
    depositInvoices: r.attachments?.depositInvoices,
    shitblerjeOverrides: r.attachments?.shitblerjeOverrides,
    sellerAudit: r.attachments?.sellerAudit,

    createdAt: r.created_at ?? r.attachments?.createdAt ?? new Date().toISOString(),
});

export const syncSalesWithSupabase = async (
    client: SupabaseClient,
    localSales: CarSale[],
    userProfile: string
): Promise<{ success: boolean; data?: CarSale[]; error?: string; failedIds?: string[] }> => {
    try {
        // 1. Upsert Local to Remote (Single batch to ensure all-or-none behavior)
        const salesToPush = localSales.map(s => toRemote(s, userProfile));
        if (salesToPush.length > 0) {
            const { error: upsertError } = await client
                .from('sales')
                .upsert(salesToPush, { onConflict: 'id' });

            if (upsertError) {
                const message = upsertError.message || '';
                if (message.includes('schema cache') && message.includes('column')) {
                    const columnMatch = message.match(/'([^']+)' column/);
                    const columnToDrop = columnMatch?.[1];
                    if (columnToDrop) {
                        const fallbackSalesToPush = salesToPush.map(({ [columnToDrop]: _ignored, ...rest }) => rest);
                        const { error: retryError } = await client
                            .from('sales')
                            .upsert(fallbackSalesToPush, { onConflict: 'id' });
                        if (!retryError) {
                            console.warn(`Sales sync retry succeeded after dropping missing column: ${columnToDrop}`);
                        } else {
                            console.error("Sync Error Batch (retry):", retryError.message || retryError.code || retryError.details || JSON.stringify(retryError));
                            return { success: false, error: retryError.message || retryError.code || retryError.details || "Unknown sync error" };
                        }
                    } else {
                        console.error("Sync Error Batch:", message || upsertError.code || upsertError.details || JSON.stringify(upsertError));
                        return { success: false, error: message || upsertError.code || upsertError.details || "Unknown sync error" };
                    }
                } else {
                    console.error("Sync Error Batch:", message || upsertError.code || upsertError.details || JSON.stringify(upsertError));
                    return { success: false, error: message || upsertError.code || upsertError.details || "Unknown sync error" };
                }
            }
        }

        // 2. Fetch Latest State from Supabase
        const { data: remoteSales, error: fetchError } = await client
            .from('sales')
            .select('*');

        if (fetchError) {
            console.error("Fetch Error:", fetchError);
            return { success: false, error: fetchError.message };
        }

        // 3. Map Remote to Local
        const syncedSales = remoteSales ? remoteSales.map(r => fromRemote(r)) : localSales;
        // Return latest remote state (which includes our just-pushed changes generally, unless race condition)
        return { success: true, data: syncedSales };

    } catch (e: any) {
        console.error("Supabase Sync Exception:", e);
        if (e instanceof TypeError && e.message === 'Load failed') {
            return { success: false, error: 'Network/CORS Error: Check your internet connection.' };
        }
        return { success: false, error: e.message || 'Unknown Sync Error' };
    }
};

export const syncTransactionsWithSupabase = async (
    client: SupabaseClient,
    localTxs: any[],
    userProfile: string
): Promise<{ success: boolean; data?: any[]; error?: string }> => {
    try {
        // 1. Fetch Remote Data
        const { data: remoteTxs, error: fetchError } = await client
            .from('bank_transactions')
            .select('*');

        if (fetchError) {
            return { success: false, error: fetchError.message };
        }

        // 2. Prepare Local Data for Upsert
        // We need IDs. If local tx doesn't have ID, generate one.
        // NOTE: This modifies localTxs slightly by adding IDs if missing, which we should prop back.
        const txsToPush = localTxs.map(tx => {
            const id = tx.id || crypto.randomUUID(); // Ensure ID
            return {
                ...tx,
                id,
                date: tx.date,
                description: tx.description,
                category: tx.category,
                amount: tx.amount,
                last_edited_by: userProfile
            };
        });

        // Upsert
        const { error: upsertError } = await client
            .from('bank_transactions')
            .upsert(txsToPush, { onConflict: 'id' });

        if (upsertError) return { success: false, error: upsertError.message };

        // 3. Fetch Final State
        const { data: finalTxs, error: finalFetchError } = await client
            .from('bank_transactions')
            .select('*');

        if (finalFetchError) return { success: false, error: finalFetchError.message };

        return { success: true, data: finalTxs };

    } catch (e: any) {
        console.error("Supabase TX Sync Exception:", e);
        if (e instanceof TypeError && e.message === 'Load failed') {
            return { success: false, error: 'Network/CORS Error: Check your internet connection and Supabase CORS settings.' };
        }
        return { success: false, error: e.message || 'Unknown Sync Error' };
    }
};

export const reassignProfileAndDelete = async (
    client: SupabaseClient,
    fromProfile: string,
    toProfile: string
): Promise<{ success: boolean; error?: string }> => {
    try {
        const { error } = await client.rpc('reassign_profile_and_delete', {
            from_profile: fromProfile,
            to_profile: toProfile
        });
        if (error) {
            return { success: false, error: error.message || 'Failed to reassign profile.' };
        }
        return { success: true };
    } catch (e: any) {
        console.error("Supabase profile reassign exception:", e);
        return { success: false, error: e?.message || 'Unknown error.' };
    }
};
