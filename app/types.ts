export type PaymentMethod = 'Cash' | 'Bank' | 'Mixed';
export type SaleStatus = 'New' | 'In Progress' | 'Shipped' | 'Completed' | 'Cancelled' | 'Inspection' | 'Autosallon';
export type ContractType = 'deposit' | 'full_marreveshje' | 'full_shitblerje';

export interface Attachment {
    name: string;
    data: string; // Base64
    type: string; // mime type
    size: number;
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

    costToBuy: number;
    soldPrice: number;

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
    createdAt: string;
    sortOrder?: number;
    soldBy?: string;
    group?: string; // For grouping (e.g. "15 november SANG SHIN")
    invoiceId?: string;
}
