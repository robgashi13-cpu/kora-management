import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { CarSale } from '@/app/types';

export const createSupabaseClient = (url: string, key: string): SupabaseClient => {
    return createClient(url, key);
};

// Helper to map Local (camel) to Remote (snake)
const toRemote = (s: CarSale, userProfile: string) => ({
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
    // buyer_personal_id: s.buyerPersonalId, // Schema mismatch: column missing in DB. Saved in attachments.
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
    // Use attachments JSONB for flexible storage of missing columns and full backup
    attachments: {
        ...s, // Data Redundancy: Save ALL scalar fields and arrays to JSONB to ensure nothing is lost
        last_edited_by: userProfile
    },
    last_edited_by: userProfile,
});

// Helper to map Remote (snake) to Local (camel)
const fromRemote = (r: any): CarSale => ({
    id: r.id,
    brand: r.brand || r.attachments?.brand,
    model: r.model || r.attachments?.model,
    year: r.year || r.attachments?.year,
    km: r.km || r.attachments?.km,
    color: r.color || r.attachments?.color,
    plateNumber: r.plate_number || r.attachments?.plateNumber,
    vin: r.vin || r.attachments?.vin,
    sellerName: r.seller_name || r.attachments?.sellerName,
    buyerName: r.buyer_name || r.attachments?.buyerName,
    buyerPersonalId: r.buyer_personal_id || r.attachments?.buyerPersonalId,
    shippingName: r.shipping_name || r.attachments?.shippingName,
    shippingDate: r.shipping_date || r.attachments?.shippingDate,
    includeTransport: r.include_transport ?? r.attachments?.includeTransport,
    costToBuy: r.cost_to_buy || r.attachments?.costToBuy,
    soldPrice: r.sold_price || r.attachments?.soldPrice,
    amountPaidCash: r.amount_paid_cash || r.attachments?.amountPaidCash,
    amountPaidBank: r.amount_paid_bank || r.attachments?.amountPaidBank,
    deposit: r.deposit || r.attachments?.deposit,
    depositDate: r.deposit_date || r.attachments?.depositDate,
    servicesCost: r.services_cost || r.attachments?.servicesCost,
    tax: r.tax || r.attachments?.tax,
    amountPaidByClient: r.amount_paid_by_client || r.attachments?.amountPaidByClient,
    amountPaidToKorea: r.amount_paid_to_korea || r.attachments?.amountPaidToKorea,
    paidDateToKorea: r.paid_date_to_korea || r.attachments?.paidDateToKorea,
    paidDateFromClient: r.paid_date_from_client || r.attachments?.paidDateFromClient,
    paymentMethod: (r.payment_method || r.attachments?.paymentMethod) as any,
    status: (r.status || r.attachments?.status) as any,
    sortOrder: r.sort_order || r.attachments?.sortOrder,
    // Extract attachments and extras
    bankReceipt: r.attachments?.bankReceipt,
    bankReceipts: r.attachments?.bankReceipts,
    bankInvoice: r.attachments?.bankInvoice,
    bankInvoices: r.attachments?.bankInvoices,
    depositInvoices: r.attachments?.depositInvoices,

    // Recover fields from attachments if not in columns
    notes: r.notes || r.attachments?.notes,
    group: r.group || r.attachments?.group,

    createdAt: r.created_at || r.attachments?.createdAt || new Date().toISOString(),
    soldBy: r.sold_by || r.attachments?.soldBy,
});

export const syncSalesWithSupabase = async (
    client: SupabaseClient,
    localSales: CarSale[],
    userProfile: string
): Promise<{ success: boolean; data?: CarSale[]; error?: string }> => {
    try {
        // 1. Upsert Local to Remote (Row-by-Row to isolate huge payloads)
        const salesToPush = localSales.map(s => toRemote(s, userProfile));
        let errorCount = 0;
        let lastError = "";

        for (const item of salesToPush) {
            try {
                const { error: upsertError } = await client
                    .from('sales')
                    .upsert(item, { onConflict: 'id' });

                if (upsertError) {
                    console.error("Sync Error Item:", item.id, "Error:", upsertError.message || upsertError.code || upsertError.details || JSON.stringify(upsertError));
                    errorCount++;
                    lastError = upsertError.message || upsertError.code || upsertError.details || "Unknown sync error";
                }
            } catch (e: any) {
                console.error("Network Sync Error Item:", item.id, e);
                errorCount++;
                lastError = e.message || "Network Error";
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
