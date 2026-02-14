import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { CarSale } from '@/app/types';

const ADMIN_PROFILE = 'Robert';

const normalizeProfileName = (name?: string | null) => {
    if (!name) return '';
    return name.trim();
};

const isAdminProfile = (profile?: string | null) => normalizeProfileName(profile) === ADMIN_PROFILE;

const canAccessSale = (sale: CarSale, profile: string) => {
    if (isAdminProfile(profile)) return true;
    const normalizedProfile = normalizeProfileName(profile);
    return normalizeProfileName(sale.soldBy) === normalizedProfile || normalizeProfileName(sale.sellerName) === normalizedProfile;
};

export const createSupabaseClient = (url: string, key: string): SupabaseClient => {
    return createClient(url, key, {
        global: {
            fetch: (input, init) => {
                const headers = new Headers(init?.headers || {});
                headers.set('cache-control', 'no-store, no-cache, must-revalidate');
                headers.set('pragma', 'no-cache');
                headers.set('expires', '0');
                return fetch(input, {
                    ...init,
                    cache: 'no-store',
                    headers,
                });
            }
        },
        realtime: {
            params: {
                eventsPerSecond: 10,
            }
        }
    });
};

const tryRefreshSchemaCache = async (client: SupabaseClient) => {
    try {
        const { error } = await client.rpc('reload_schema_cache');
        if (error) {
            console.warn('Schema cache refresh failed:', error.message || error.details || error.hint || error.code);
            return false;
        }
        return true;
    } catch (e) {
        console.warn('Schema cache refresh threw an error:', e);
        return false;
    }
};

const getSchemaCacheErrorDetails = (error: any) => {
    const messageParts = [error?.message, error?.details, error?.hint].filter(Boolean);
    const message = messageParts.join(' ');
    const isSchemaCacheIssue = message.includes('schema cache') && message.includes('column');
    const columnMatch = message.match(/'([^']+)' column/);
    return { isSchemaCacheIssue, columnToDrop: columnMatch?.[1], message };
};

// Helper to map Local (camel) to Remote (snake)
// CRITICAL: Every field that exists as a DB column MUST be mapped here to persist correctly
const toRemote = (sale: CarSale, userProfile: string) => {
    const s = sale;
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
        transport_paid: s.transportPaid,
        paid_to_transportusi: s.paidToTransportusi,
        transport_cost: s.transportCost,
        cost_to_buy: s.costToBuy,
        sold_price: s.soldPrice,
        custom_price_discount: s.customPriceDiscount,
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
    transportPaid: r.transport_paid ?? r.attachments?.transportPaid ?? 'NOT PAID',
    paidToTransportusi: r.paid_to_transportusi ?? r.attachments?.paidToTransportusi ?? 'NOT PAID',
    transportCost: r.transport_cost ?? r.attachments?.transportCost ?? (r.include_transport ?? r.attachments?.includeTransport ? 350 : 0),
    costToBuy: r.cost_to_buy ?? r.attachments?.costToBuy,
    baseCostToBuy: r.attachments?.baseCostToBuy,
    soldPrice: r.sold_price ?? r.attachments?.soldPrice,
    customPriceDiscount: r.custom_price_discount ?? r.attachments?.customPriceDiscount,
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
        const roleScopedSales = localSales
            .filter((sale) => canAccessSale(sale, userProfile));

        // 1. Upsert Local to Remote (Single batch to ensure all-or-none behavior)
        const salesToPush = roleScopedSales.map(s => toRemote(s, userProfile));
        let latestUpsertedRows: any[] = [];
        if (salesToPush.length > 0) {
            let payloadToPush = salesToPush;
            const droppedColumns = new Set<string>();
            let refreshedSchemaCache = false;
            let lastError: any = null;
            const maxAttempts = Math.max(4, Object.keys(salesToPush[0] ?? {}).length + 2);

            for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
                const { data: upsertedRows, error: upsertError } = await client
                    .from('sales')
                    .upsert(payloadToPush, { onConflict: 'id' })
                    .select('*');

                if (!upsertError) {
                    const pushedIds = payloadToPush
                        .map((item) => typeof item.id === 'string' ? item.id : '')
                        .filter(Boolean);
                    const returnedIds = new Set((upsertedRows || []).map((row: { id: string }) => row.id));
                    const missingIds = pushedIds.filter((id) => !returnedIds.has(id));

                    console.info('[sales.sync] upsert response', {
                        attempted: pushedIds.length,
                        returned: returnedIds.size,
                        missing: missingIds.length,
                    });

                    if (missingIds.length > 0) {
                        console.error('[sales.sync] upsert did not return all IDs', {
                            missingIds,
                            hint: 'Possible RLS reject or invalid row payload.'
                        });
                        return {
                            success: false,
                            error: `Sales upsert incomplete. Missing IDs: ${missingIds.join(', ')}`,
                            failedIds: missingIds
                        };
                    }

                    latestUpsertedRows = upsertedRows || [];

                    if (droppedColumns.size > 0) {
                        console.warn(`Sales sync retry succeeded after dropping missing columns: ${Array.from(droppedColumns).join(', ')}`);
                    }
                    lastError = null;
                    break;
                }

                const { isSchemaCacheIssue, columnToDrop } = getSchemaCacheErrorDetails(upsertError);

                if (!isSchemaCacheIssue) {
                    lastError = upsertError;
                    break;
                }

                if (!refreshedSchemaCache) {
                    refreshedSchemaCache = await tryRefreshSchemaCache(client);
                    if (refreshedSchemaCache) {
                        continue;
                    }
                }

                if (!columnToDrop || droppedColumns.has(columnToDrop)) {
                    lastError = upsertError;
                    break;
                }

                droppedColumns.add(columnToDrop);
                payloadToPush = payloadToPush.map(({ [columnToDrop]: _ignored, ...rest }) => rest);
                lastError = upsertError;
            }

            if (lastError) {
                console.error("Sync Error Batch:", lastError.message || lastError.code || lastError.details || JSON.stringify(lastError));
                console.error('[sales.sync] payload sample', payloadToPush[0]);
                return { success: false, error: lastError.message || lastError.code || lastError.details || "Unknown sync error" };
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
        // Merge upsert response rows over fetched rows to avoid stale read-after-write windows.
        const mergedRemoteRows = new Map<string, any>();
        (remoteSales || []).forEach((row: any) => {
            if (row?.id) mergedRemoteRows.set(row.id, row);
        });
        (latestUpsertedRows || []).forEach((row: any) => {
            if (row?.id) {
                mergedRemoteRows.set(row.id, row);
            }
        });

        const syncedSales = Array.from(mergedRemoteRows.values())
            .map(r => fromRemote(r))
            .filter((sale) => canAccessSale(sale, userProfile));
        // Return latest remote state with locally upserted rows merged in for consistency.
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
