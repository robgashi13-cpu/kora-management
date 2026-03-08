import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PROFILES = [
  { profile_name: "Robert", email: "robert@kora.app", is_admin: true, password: "password2" },
  { profile_name: "ETNIK", email: "etnik@kora.app", is_admin: false, password: "etnik2025!" },
  { profile_name: "GENC", email: "genc@kora.app", is_admin: false, password: "genc2025!" },
  { profile_name: "LEONIT", email: "leonit@kora.app", is_admin: false, password: "leonit2025!" },
  { profile_name: "RAJMOND", email: "rajmond@kora.app", is_admin: false, password: "rajmond2025!" },
  { profile_name: "RENAT", email: "renat@kora.app", is_admin: false, password: "renat2025!" },
];

Deno.serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const results: Array<{ profile: string; status: string; error?: string }> = [];

    for (const profile of PROFILES) {
      // Check if user already exists
      const { data: existingProfiles } = await admin
        .from("profiles")
        .select("id")
        .eq("profile_name", profile.profile_name)
        .maybeSingle();

      if (existingProfiles) {
        results.push({ profile: profile.profile_name, status: "already_exists" });
        continue;
      }

      // Create auth user
      const { data: userData, error: createError } = await admin.auth.admin.createUser({
        email: profile.email,
        password: DEFAULT_PASSWORD,
        email_confirm: true,
        user_metadata: {
          profile_name: profile.profile_name,
          is_admin: profile.is_admin,
        },
      });

      if (createError) {
        // If user exists in auth but not in profiles, try to link
        if (createError.message?.includes("already been registered")) {
          results.push({ profile: profile.profile_name, status: "auth_exists_already" });
        } else {
          results.push({ profile: profile.profile_name, status: "error", error: createError.message });
        }
        continue;
      }

      results.push({ profile: profile.profile_name, status: "created", });
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});
