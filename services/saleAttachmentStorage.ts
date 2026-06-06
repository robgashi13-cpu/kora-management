import { cloudClient as supabase } from '@/services/cloudAuth';
import { Attachment, CarSale } from '@/src/types';

export type SaleAttachmentField = 'bankReceipts' | 'bankInvoices' | 'depositInvoices';

const SALE_ATTACHMENT_BUCKET = 'per-pages';
const SALE_ATTACHMENT_FOLDER = 'car-sales';

const sanitizePathSegment = (value: string) => {
    const normalized = value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

    return normalized || 'file';
};

const buildAttachmentPath = (saleId: string, field: SaleAttachmentField, fileName: string) => {
    const safeSaleId = sanitizePathSegment(saleId);
    const safeName = sanitizePathSegment(fileName);
    const suffix = Math.random().toString(36).slice(2, 8);
    return `${SALE_ATTACHMENT_FOLDER}/${safeSaleId}/${field}/${Date.now()}-${suffix}-${safeName}`;
};

const withResolvedUrl = (attachment: Attachment): Attachment => {
    if (attachment.fileUrl) return attachment;
    if (!attachment.storageBucket || !attachment.storagePath) return attachment;
    const { data } = supabase.storage.from(attachment.storageBucket).getPublicUrl(attachment.storagePath);
    return {
        ...attachment,
        fileUrl: data.publicUrl
    };
};

const sameAttachment = (left: Attachment, right: Attachment) => {
    if (left.storagePath && right.storagePath) return left.storagePath === right.storagePath;
    if (left.fileUrl && right.fileUrl) return left.fileUrl === right.fileUrl;
    return left.name === right.name && left.size === right.size && left.type === right.type;
};

export const resolveAttachmentUrl = (attachment?: Attachment | null) => {
    if (!attachment) return null;
    if (attachment.data) return attachment.data;
    if (attachment.fileUrl) return attachment.fileUrl;
    if (attachment.storageBucket && attachment.storagePath) {
        const { data } = supabase.storage.from(attachment.storageBucket).getPublicUrl(attachment.storagePath);
        return data.publicUrl;
    }
    return null;
};

export const stripAttachmentData = (attachment: Attachment): Attachment => {
    const { data, ...rest } = attachment;
    return withResolvedUrl(rest as Attachment);
};

export const sanitizeSaleDraft = (sale: Partial<CarSale>): Partial<CarSale> => ({
    ...sale,
    bankReceipt: sale.bankReceipt ? stripAttachmentData(sale.bankReceipt) : sale.bankReceipt,
    bankReceipts: sale.bankReceipts?.map(stripAttachmentData),
    bankInvoice: sale.bankInvoice ? stripAttachmentData(sale.bankInvoice) : sale.bankInvoice,
    bankInvoices: sale.bankInvoices?.map(stripAttachmentData),
    depositInvoices: sale.depositInvoices?.map(stripAttachmentData),
});

export const rehydrateDraftSaleAttachments = (baseSale: Partial<CarSale>, draftSale: Partial<CarSale>): Partial<CarSale> => {
    const rehydrateList = (draftFiles?: Attachment[], baseFiles?: Attachment[]) => draftFiles?.map((draftFile) => {
        const baseMatch = baseFiles?.find((baseFile) => sameAttachment(baseFile, draftFile));
        if (!baseMatch) return withResolvedUrl(draftFile);
        return withResolvedUrl({
            ...baseMatch,
            ...draftFile,
            data: draftFile.data ?? baseMatch.data,
        });
    });

    const rehydrateSingle = (draftFile?: Attachment, baseFile?: Attachment) => {
        if (!draftFile) return draftFile;
        if (!baseFile) return withResolvedUrl(draftFile);
        if (!sameAttachment(baseFile, draftFile)) return withResolvedUrl(draftFile);
        return withResolvedUrl({
            ...baseFile,
            ...draftFile,
            data: draftFile.data ?? baseFile.data,
        });
    };

    return {
        ...baseSale,
        ...draftSale,
        bankReceipt: rehydrateSingle(draftSale.bankReceipt, baseSale.bankReceipt),
        bankReceipts: rehydrateList(draftSale.bankReceipts, baseSale.bankReceipts),
        bankInvoice: rehydrateSingle(draftSale.bankInvoice, baseSale.bankInvoice),
        bankInvoices: rehydrateList(draftSale.bankInvoices, baseSale.bankInvoices),
        depositInvoices: rehydrateList(draftSale.depositInvoices, baseSale.depositInvoices),
    };
};

export const uploadFileToSaleStorage = async (file: File, saleId: string, field: SaleAttachmentField): Promise<Attachment> => {
    const path = buildAttachmentPath(saleId, field, file.name);
    const { error } = await supabase.storage
        .from(SALE_ATTACHMENT_BUCKET)
        .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });

    if (error) {
        throw new Error(error.message || `Failed to upload ${file.name}.`);
    }

    const { data } = supabase.storage.from(SALE_ATTACHMENT_BUCKET).getPublicUrl(path);
    return {
        name: file.name,
        type: file.type || 'application/octet-stream',
        size: file.size,
        storageBucket: SALE_ATTACHMENT_BUCKET,
        storagePath: path,
        fileUrl: data.publicUrl,
    };
};

export const uploadAttachmentToSaleStorage = async (attachment: Attachment, saleId: string, field: SaleAttachmentField): Promise<Attachment> => {
    if (attachment.storagePath || attachment.fileUrl) {
        return withResolvedUrl({
            ...attachment,
            storageBucket: attachment.storageBucket || SALE_ATTACHMENT_BUCKET,
        });
    }

    if (!attachment.data) {
        return attachment;
    }

    const response = await fetch(attachment.data);
    const blob = await response.blob();
    const path = buildAttachmentPath(saleId, field, attachment.name || 'attachment');
    const { error } = await supabase.storage
        .from(SALE_ATTACHMENT_BUCKET)
        .upload(path, blob, { contentType: attachment.type || blob.type || 'application/octet-stream', upsert: false });

    if (error) {
        throw new Error(error.message || `Failed to upload ${attachment.name || 'attachment'}.`);
    }

    const { data } = supabase.storage.from(SALE_ATTACHMENT_BUCKET).getPublicUrl(path);
    return {
        name: attachment.name,
        type: attachment.type || blob.type || 'application/octet-stream',
        size: attachment.size || blob.size,
        storageBucket: SALE_ATTACHMENT_BUCKET,
        storagePath: path,
        fileUrl: data.publicUrl,
    };
};

export const deleteStoredAttachment = async (attachment?: Attachment | null) => {
    if (!attachment?.storagePath) return;
    const bucket = attachment.storageBucket || SALE_ATTACHMENT_BUCKET;
    const { error } = await supabase.storage.from(bucket).remove([attachment.storagePath]);
    if (error) {
        throw new Error(error.message || `Failed to delete ${attachment.name || 'attachment'}.`);
    }
};