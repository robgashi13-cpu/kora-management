import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type ScanFile = {
  name: string;
  type: string;
  url?: string;
  data?: string; // base64 (no prefix or with data: prefix)
  category: "bankReceipts" | "bankInvoices" | "depositInvoices";
};

type Extracted = {
  method: "Bank" | "Cash" | "Deposit";
  amount: number;
  date?: string;
  note?: string;
  sourceFile: string;
};

const SYSTEM_PROMPT = `You are a payment extraction engine for a car dealership.
You receive scanned bank receipts, bank invoices, or deposit invoices (images/PDF pages).
Extract every PAYMENT TRANSACTION you can identify.

Rules:
- "method": "Bank" for wire/bank transfer receipts/invoices. "Cash" only if document explicitly says cash. "Deposit" for deposit invoices/receipts.
- "amount": positive number in EUR (strip currency, parse "1.234,56" or "1,234.56" correctly).
- "date": ISO date (YYYY-MM-DD) if visible, else omit.
- "note": short reference (transaction id, invoice number, payer/payee), max 80 chars.
- Skip totals/balances/fees that are not actual payments.
- Output STRICT JSON: { "payments": [ {method, amount, date?, note?} ] }. No prose.`;

const stripDataPrefix = (s: string) => {
  const idx = s.indexOf("base64,");
  return idx >= 0 ? s.slice(idx + 7) : s;
};

const fetchAsDataUrl = async (url: string, mime: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    bin += String.fromCharCode(...buf.subarray(i, i + chunk));
  }
  const b64 = btoa(bin);
  const type = res.headers.get("content-type") || mime || "application/octet-stream";
  return `data:${type};base64,${b64}`;
};

const buildContentBlocks = async (file: ScanFile) => {
  let dataUrl: string;
  if (file.data) {
    const raw = stripDataPrefix(file.data);
    dataUrl = `data:${file.type || "application/octet-stream"};base64,${raw}`;
  } else if (file.url) {
    dataUrl = await fetchAsDataUrl(file.url, file.type);
  } else {
    throw new Error("No data or url");
  }

  const isPdf = (file.type || "").includes("pdf") || dataUrl.startsWith("data:application/pdf");
  if (isPdf) {
    return [
      { type: "text", text: `File: ${file.name} (category: ${file.category})` },
      { type: "file", file: { filename: file.name, file_data: dataUrl } },
    ];
  }
  return [
    { type: "text", text: `File: ${file.name} (category: ${file.category})` },
    { type: "image_url", image_url: { url: dataUrl } },
  ];
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

    const { files } = (await req.json()) as { files: ScanFile[] };
    if (!Array.isArray(files) || files.length === 0) {
      return new Response(JSON.stringify({ error: "No files provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const all: Extracted[] = [];
    const errors: string[] = [];

    for (const f of files) {
      try {
        const blocks = await buildContentBlocks(f);
        const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              { role: "user", content: blocks },
            ],
            response_format: { type: "json_object" },
          }),
        });

        if (!res.ok) {
          const t = await res.text();
          errors.push(`${f.name}: ${res.status} ${t.slice(0, 200)}`);
          continue;
        }

        const json = await res.json();
        const content = json?.choices?.[0]?.message?.content || "{}";
        let parsed: any = {};
        try { parsed = JSON.parse(content); } catch { parsed = {}; }
        const list = Array.isArray(parsed) ? parsed : (parsed.payments || parsed.transactions || []);

        for (const p of list) {
          const amt = Number(String(p.amount ?? "").toString().replace(/[^\d.\-]/g, ""));
          if (!Number.isFinite(amt) || amt <= 0) continue;
          let method: Extracted["method"] = "Bank";
          const raw = String(p.method ?? "").toLowerCase();
          if (raw.includes("cash")) method = "Cash";
          else if (raw.includes("deposit") || f.category === "depositInvoices") method = "Deposit";
          else method = "Bank";
          all.push({
            method,
            amount: Math.round(amt * 100) / 100,
            date: p.date || undefined,
            note: (p.note || "").toString().slice(0, 80) || undefined,
            sourceFile: f.name,
          });
        }
      } catch (e) {
        errors.push(`${f.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return new Response(JSON.stringify({ payments: all, errors }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
