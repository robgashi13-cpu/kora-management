import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function hashWithSalt(password: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(digest);
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const password = body?.password;

    if (typeof password !== "string" || !password) {
      return new Response(JSON.stringify({ ok: false }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const salt = Deno.env.get("ADMIN_PASSWORD_SALT");
    const hash = Deno.env.get("ADMIN_PASSWORD_HASH");

    if (!salt || !hash) {
      console.error("ADMIN_PASSWORD_SALT and ADMIN_PASSWORD_HASH must be configured.");
      return new Response(JSON.stringify({ ok: false }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const computed = await hashWithSalt(password, salt);

    // Constant-time comparison
    const a = new TextEncoder().encode(computed);
    const b = new TextEncoder().encode(hash);
    let ok = a.length === b.length;
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      ok = ok && a[i] === b[i];
    }

    return new Response(JSON.stringify({ ok }), {
      status: ok ? 200 : 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Admin auth error:", error);
    return new Response(JSON.stringify({ ok: false }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
