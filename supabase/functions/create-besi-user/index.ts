import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: existing } = await adminClient
    .from("profiles")
    .select("id")
    .eq("profile_name", "Besi")
    .maybeSingle();

  if (existing) {
    return new Response(
      JSON.stringify({ message: "Besi profile already exists", id: existing.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const { data: userData, error: createError } = await adminClient.auth.admin.createUser({
    email: "besi@kora.app",
    password: "kora-internal-v1-besi@kora.app-temp",
    email_confirm: true,
    user_metadata: { profile_name: "Besi", is_admin: false },
  });

  if (createError) {
    return new Response(
      JSON.stringify({ error: createError.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({ message: "Besi user created", id: userData.user?.id }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
