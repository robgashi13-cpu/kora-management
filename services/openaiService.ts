import OpenAI from "openai";

export const extractTextFromPdf = async (base64Pdf: string): Promise<string> => {
    try {
        // @ts-ignore
        const pdfjsLib = await import('pdfjs-dist/build/pdf');

        // Basic worker setup for nextjs
        if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
            pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
        }

        const loadingTask = pdfjsLib.getDocument({ data: atob(base64Pdf) });
        const pdf = await loadingTask.promise;
        let fullText = '';

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map((item: any) => item.str).join(' ');
            fullText += `--- Page ${i} ---\n${pageText}\n`;
        }
        return fullText;
    } catch (e) {
        console.error("PDF Text Extraction Failed", e);
        throw new Error("Could not extract text from PDF.");
    }
};

export const analyzeBankStatement = async (apiKey: string, base64Pdf: string): Promise<any[]> => {
    const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });

    // 1. Extract Text from PDF (Client Side)
    const pdfText = await extractTextFromPdf(base64Pdf);

    // 2. Send Text to GPT-4o
    const prompt = `
        You are an expert financial analyst. Analyze this bank statement text extracted from a PDF.
        Extract every single transaction you can see.
        For each transaction, return a JSON object with these fields:
        - date (string, YYYY-MM-DD format)
        - description (string, original text)
        - amount (number, positive for deposits, negative for withdrawals)
        - type (string, 'Credit' or 'Debit')
        - category (string, guess the category e.g., 'Shipping', 'Car Purchase', 'Fuel', 'Uncategorized')
        
        Return ONLY a JSON array of these objects. No markdown.
    `;

    try {
        const completion = await openai.chat.completions.create({
            messages: [
                { role: "system", content: prompt },
                { role: "user", content: pdfText }
            ],
            model: "gpt-4o",
            response_format: { type: "json_object" }
        });

        const content = completion.choices[0].message.content;
        if (!content) throw new Error("No content returned");

        const parsed = JSON.parse(content);
        return parsed.transactions || parsed; // Handle { transactions: [...] } or [...]
    } catch (error: any) {
        console.error("OpenAI Analysis Failed", error);
        if (error?.status === 429) {
            throw new Error("OpenAI Invoice Quota Exceeded. Please check billing at platform.openai.com.");
        }
        throw error;
    }
};

export const processImportedData = async (apiKey: string, rawData: any[], onProgress?: (msg: string) => void): Promise<any[]> => {
    const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });

    // Process in chunks of 20 to ensure high quality and avoid token limits
    const CHUNK_SIZE = 20;
    const allProcessedSales: any[] = [];

    // Calculate total batches
    const batches = Math.ceil(rawData.length / CHUNK_SIZE);

    for (let i = 0; i < batches; i++) {
        const start = i * CHUNK_SIZE;
        const end = start + CHUNK_SIZE;
        const dataSlice = rawData.slice(start, end);

        const msg = `Processing batch ${i + 1}/${batches}...`;
        console.log(msg);
        if (onProgress) onProgress(msg);

        const prompt = `
            You are a Data Integration Specialist for a car dealership.
            I will provide raw data from an imported file (Excel/JSON).
            Your job is to MAP and CLEAN this data into a specific JSON Schema for our database.

            Target Schema (CarSale Object):
            {
                id: string (use existing, or find 'id'/'uuid' column, or generate UUID),
                brand: string (standardize e.g. "BMW " -> "BMW", "Merc" -> "Mercedes-Benz"),
                model: string (Clean text),
                year: number (Parse 2-digit years to 4-digit if needed),
                vin: string (ESSENTIAL. Remove spaces/dashes. If missing, leave null),
                costToBuy: number (Remove currency symbols, parse '20.000' as 20000),
                soldPrice: number (Remove currency symbols),
                amountPaidCash: number,
                amountPaidBank: number,
                deposit: number,
                color: string (Standardize "Blk" -> "Black"),
                buyerName: string (Title Case),
                sellerName: string (Title Case),
                shippingName: string,
                shippingDate: string (YYYY-MM-DD),
                plateNumber: string,
                status: string ('In Progress', 'Completed', 'Shipped', 'Cancelled'),
                paymentMethod: string ('Cash', 'Bank', 'Mixed'),
                km: number (mileage, if 'k' suffix e.g. '150k' -> 150000)
            }

            Rules:
            1. EXACT MATCHING: Do not hallucinate data. If a column is missing, leave the field null/undefined.
            2. INFER STATUS: 
               - If 'soldPrice' > 0 and 'shippingDate' exists -> 'Shipped'
               - If 'soldPrice' > 0 -> 'Completed'
               - Else -> 'In Progress'
            3. DATES: Convert Excel serials or strings to strict YYYY-MM-DD.
            4. CATEGORIZE: Ensure 'brand' and 'model' are separated correctly if merged in one column.
            5. Return ONLY a JSON array of these objects under a 'sales' key.

            Raw Data:
            ${JSON.stringify(dataSlice)}
        `;

        try {
            const completion = await openai.chat.completions.create({
                messages: [
                    { role: "system", content: "You are a helpful assistant that transforms raw data into strict JSON." },
                    { role: "user", content: prompt }
                ],
                model: "gpt-4o",
                response_format: { type: "json_object" }
            });

            const content = completion.choices[0].message.content;
            if (content) {
                const parsed = JSON.parse(content);
                let batchSales = [];
                if (Array.isArray(parsed)) batchSales = parsed;
                else if (parsed.sales && Array.isArray(parsed.sales)) batchSales = parsed.sales;
                else if (parsed.data && Array.isArray(parsed.data)) batchSales = parsed.data;
                else if (parsed.items && Array.isArray(parsed.items)) batchSales = parsed.items;

                allProcessedSales.push(...batchSales);
            }
        } catch (e: any) {
            console.error("OpenAI Import Processing Failed for batch", i, e);
            if (e?.status === 429) {
                throw new Error("You exceeded your OpenAI current quota. Please check billing at platform.openai.com.");
            }
            throw e;
        }
    }

    return allProcessedSales;
};
