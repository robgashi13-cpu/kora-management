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
    buyer_personal_id: s.buyerPersonalId,
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
    // Store attachments in JSONB
    attachments: { bankReceipt: s.bankReceipt, bankReceipts: s.bankReceipts, bankInvoices: s.bankInvoices, depositInvoices: s.depositInvoices },
    last_edited_by: userProfile,
    sold_by: s.soldBy
});

// Helper to map Remote (snake) to Local (camel)
const fromRemote = (r: any): CarSale => ({
    id: r.id,
    brand: r.brand,
    model: r.model,
    year: r.year,
    km: r.km,
    color: r.color,
    plateNumber: r.plate_number,
    vin: r.vin,
    sellerName: r.seller_name,
    buyerName: r.buyer_name,
    buyerPersonalId: r.buyer_personal_id,
    shippingName: r.shipping_name,
    shippingDate: r.shipping_date,
    includeTransport: r.include_transport,
    costToBuy: r.cost_to_buy,
    soldPrice: r.sold_price,
    amountPaidCash: r.amount_paid_cash,
    amountPaidBank: r.amount_paid_bank,
    deposit: r.deposit,
    depositDate: r.deposit_date,
    servicesCost: r.services_cost,
    tax: r.tax,
    amountPaidByClient: r.amount_paid_by_client,
    amountPaidToKorea: r.amount_paid_to_korea,
    paidDateToKorea: r.paid_date_to_korea,
    paidDateFromClient: r.paid_date_from_client,
    paymentMethod: r.payment_method as any,
    status: r.status as any,
    sortOrder: r.sort_order,
    // Extract attachments
    bankReceipt: r.attachments?.bankReceipt,
    bankReceipts: r.attachments?.bankReceipts,
    bankInvoices: r.attachments?.bankInvoices,
    depositInvoices: r.attachments?.depositInvoices,
    createdAt: r.created_at || new Date().toISOString(),
    soldBy: r.sold_by,
});

export const syncSalesWithSupabase = async (
    client: SupabaseClient,
    localSales: CarSale[],
    userProfile: string
): Promise<{ success: boolean; data?: CarSale[]; error?: string }> => {
    try {
        // 1. Upsert Local to Remote
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
                    console.error("Sync Error Item:", item.id, upsertError);
                    errorCount++;
                    lastError = upsertError.message || JSON.stringify(upsertError);
                }
            } catch (e: any) {
                console.error("Network Sync Error Item:", item.id, e);
                errorCount++;
                lastError = e.message || "Network Error";
            }
        }

        if (errorCount > 0) {
            return { success: false, error: `Completed with ${errorCount} errors. Last: ${lastError}` };
        }

        // 2. Fetch Final State
        const { data: finalSales, error: finalFetchError } = await client
            .from('sales')
            .select('*');

        if (finalFetchError) return { success: false, error: finalFetchError.message };

        const mappedSales = (finalSales || []).map(fromRemote);
        return { success: true, data: mappedSales };

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
