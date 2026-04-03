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

  // Check if KR already exists
  const { data: existing } = await adminClient
    .from("profiles")
    .select("id")
    .eq("profile_name", "KR")
    .maybeSingle();

  if (existing) {
    return new Response(
      JSON.stringify({ message: "KR profile already exists", id: existing.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Create auth user
  const { data: userData, error: createError } = await adminClient.auth.admin.createUser({
    email: "kr@kora.app",
    password: "kora-internal-v1-kr@kora.app-temp",
    email_confirm: true,
    user_metadata: { profile_name: "KR", is_admin: false },
  });

  if (createError) {
    return new Response(
      JSON.stringify({ error: createError.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({ message: "KR user created", id: userData.user?.id }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
