// AI scan stub for payments.
// Extracts amount + sender/receiver name from attached bank receipts,
// Korea paid invoices and deposit invoices on a list of sales.
// The Gemini call is wired but commented out — flip the ENABLED flag
// (and uncomment the fetch block) to activate.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ENABLED = false; // <-- flip to true to activate Gemini

const SYSTEM_PROMPT = `You are a financial document parser for a car dealership.
For each attached image / PDF (bank receipt, Korea paid invoice, deposit invoice),
extract:
- amount (number, EUR)
- sender_name (who paid)
- receiver_name (who received)
- date (YYYY-MM-DD)
- doc_type ("bank_receipt" | "korea_paid_invoice" | "deposit_invoice")
Return ONLY a JSON array.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { sales = [] } = await req.json().catch(() => ({ sales: [] }));

    if (!ENABLED) {
      return new Response(
        JSON.stringify({
          ok: true,
          enabled: false,
          message:
            "AI scan endpoint is scaffolded but not active. Flip ENABLED in supabase/functions/scan-payments/index.ts to enable.",
          received_sales: Array.isArray(sales) ? sales.length : 0,
          results: [],
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    /* === Activate Gemini scan ===
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

    const attachments = sales.flatMap((s: any) => [
      ...(s.bankReceipts || []),
      ...(s.bankInvoices || []),
      ...(s.depositInvoices || []),
    ]);

    const content: any[] = [{ type: "text", text: "Extract structured payment data from each attachment." }];
    for (const a of attachments) {
      if (a?.fileUrl) {
        content.push({ type: "image_url", image_url: { url: a.fileUrl } });
      } else if (a?.data) {
        content.push({ type: "image_url", image_url: { url: `data:${a.type};base64,${a.data}` } });
      }
    }

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content },
        ],
      }),
    });
    const data = await resp.json();
    return new Response(JSON.stringify({ ok: true, enabled: true, data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
    === */

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: e instanceof Error ? e.message : "unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
