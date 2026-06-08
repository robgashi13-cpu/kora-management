export type PaymentMethod = 'Cash' | 'Bank' | 'Mixed';
export type SaleStatus = 'New' | 'In Progress' | 'Shipped' | 'Completed' | 'Cancelled' | 'Inspection' | 'Autosallon' | 'Archived';
export type TransportPaymentStatus = 'PAID' | 'NOT PAID';
export type ContractType = 'deposit' | 'full_marreveshje' | 'full_shitblerje';
export type ShitblerjeOverrides = {
    brand?: string;
    model?: string;
    year?: number;
    km?: number;
    color?: string;
    plateNumber?: string;
    vin?: string;
    soldPrice?: number;
    buyerName?: string;
    buyerPersonalId?: string;
};

export type SellerAuditEntry = {
    id: string;
    changedAt: string;
    changedBy: string;
    fromSeller?: string;
    toSeller?: string;
};

export interface Attachment {
    name: string;
    data?: string; // Base64 when stored inline; omitted for storage-backed files
    type: string; // mime type
    size: number;
    fileUrl?: string;
    storageBucket?: string;
    storagePath?: string;
}

export type PaymentHistoryMethod = 'Bank' | 'Cash' | 'Deposit';

export interface PaymentHistoryEntry {
    id: string;
    method: PaymentHistoryMethod;
    delta: number; // change amount (positive = added, negative = removed)
    newTotal: number; // running total for this method after the change
    changedAt: string; // ISO timestamp
    changedBy: string; // profile label/id
}


export interface CarSale {
    id: string;
    brand: string;
    model: string;
    year: number;
    km: number;
    color: string;
    plateNumber: string;
    vin: string;

    sellerName: string;
    buyerName: string;
    buyerPersonalId?: string;

    shippingName: string;
    shippingDate: string; // ISO date string
    includeTransport?: boolean;
    transportPaid?: TransportPaymentStatus;
    paidToTransportusi?: TransportPaymentStatus;
    transportCost?: number;

    costToBuy: number;
    baseCostToBuy?: number;
    soldPrice: number;
    customPriceDiscount?: number;

    // Payment Breakdown
    amountPaidCash: number;
    amountPaidBank: number;
    deposit: number;
    depositDate?: string; // New field
    servicesCost: number; // New field
    tax: number; // New field

    // Computed legacy field for compatibility if needed, but primarily we use the sum above.
    amountPaidByClient?: number;

    amountPaidToKorea?: number; // New field
    paidDateToKorea: string | null; // ISO date string
    paidDateFromClient?: string | null; // ISO date string
    isPaid?: boolean;

    paymentMethod: PaymentMethod;
    status: SaleStatus;

    bankReceipt?: Attachment; // Legacy
    bankReceipts?: Attachment[]; // New Multi-file
    bankInvoice?: Attachment; // Legacy
    bankInvoices?: Attachment[]; // New Multi-file
    depositInvoices?: Attachment[]; // New Multi-file

    notes?: string;
    invoiceDescription?: string;
    createdAt: string;
    sortOrder?: number;
    soldBy?: string;
    group?: string | null; // For grouping (e.g. "15 november SANG SHIN")
    invoiceId?: string;
    shitblerjeOverrides?: ShitblerjeOverrides;
    sellerAudit?: SellerAuditEntry[];
    paymentHistory?: PaymentHistoryEntry[];

    archivedAt?: string;
    archivedBy?: string;
    archivedFromStatus?: SaleStatus;
}

export type MechanicCarSource = 'sale' | 'shipped';

export interface MechanicRepairRecord {
    id: string;
    carId: string;
    carSource: MechanicCarSource;
    brand: string;
    model: string;
    year: number;
    km: number;
    plateNumber: string;
    vin: string;
    inspectedCity: string;
    repairedWork: string;
    needsRepairWork: string;
    repairCost: number;
    isRepaired: boolean;
    isPaid: boolean;
    createdAt: string;
    createdBy: string;
}

export interface CarDocumentRecord {
    id: string;
    shipName: string;
    carCount: number;
    files: Array<{
        id: string;
        name: string;
        size: number;
        type: string;
    }>;
    createdAt: string;
    createdBy: string;
}
