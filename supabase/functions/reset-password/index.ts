import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Get Robert's user ID from profiles
    const { data: profile } = await admin
      .from("profiles")
      .select("id")
      .eq("profile_name", "Robert")
      .maybeSingle();

    if (!profile) {
      return new Response(JSON.stringify({ error: "Robert profile not found" }), {
        headers: { "Content-Type": "application/json" },
        status: 404,
      });
    }

    // Update password
    const { error } = await admin.auth.admin.updateUserById(profile.id, {
      password: "Robertoo1396$",
    });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        headers: { "Content-Type": "application/json" },
        status: 500,
      });
    }

    return new Response(JSON.stringify({ success: true, message: "Password updated for Robert" }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});
