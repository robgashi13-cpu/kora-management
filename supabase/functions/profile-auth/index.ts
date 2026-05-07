import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// Deterministic internal password for non-admin profiles (not user-facing)
const INTERNAL_PASSWORD_PREFIX = "kora-internal-v1-";
const getInternalPassword = (email: string) =>
  `${INTERNAL_PASSWORD_PREFIX}${email}-${SERVICE_ROLE_KEY.slice(-8)}`;

const ADMIN_PASSWORD = Deno.env.get("ADMIN_PASSWORD") || "password2";

// Per-profile passwords (profile_name lowercase → password)
// Shyqa keeps her existing password. Robert (admin) uses ADMIN_PASSWORD.
// Every other non-admin profile uses `<profile_name_lowercase>123`.
const PROFILE_PASSWORDS: Record<string, string> = {
  shyqa: "12345",
};

const getExpectedPassword = (profile: { profile_name: string; is_admin: boolean }): string => {
  if (profile.is_admin) return ADMIN_PASSWORD;
  const key = profile.profile_name.toLowerCase();
  if (key in PROFILE_PASSWORDS) return PROFILE_PASSWORDS[key];
  return `${key}123`;
};

const requiresPassword = (_profile: { profile_name: string; is_admin: boolean }): boolean => {
  // All profiles now require a password.
  return true;
};


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { profileName, password } = await req.json();

    if (!profileName || typeof profileName !== "string") {
      return new Response(
        JSON.stringify({ error: "profileName is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Look up profile
    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("id, email, is_admin, profile_name")
      .eq("profile_name", profileName)
      .maybeSingle();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ error: "Profile not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if this profile requires a password
    if (requiresPassword(profile)) {
      const expectedPassword = profile.is_admin
        ? ADMIN_PASSWORD
        : PROFILE_PASSWORDS[profile.profile_name.toLowerCase()];
      if (!password || password !== expectedPassword) {
        return new Response(
          JSON.stringify({ error: "Incorrect password", requiresPassword: true }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const email = profile.email;
    // Supabase Auth requires passwords ≥ 6 chars. User-facing passwords (like "12345")
    // are validated above; the actual auth password is always the internal one (admin uses ADMIN_PASSWORD).
    const signInPassword = profile.is_admin
      ? ADMIN_PASSWORD
      : getInternalPassword(email);

    // Ensure the user has the correct password set
    // (first-time setup or password sync)
    const { error: updateError } = await adminClient.auth.admin.updateUserById(
      profile.id,
      { password: signInPassword, email_confirm: true }
    );

    if (updateError) {
      console.error("Failed to update user password:", updateError);
      return new Response(
        JSON.stringify({ error: "Auth setup failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Sign in using the anon client
    const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: signInData, error: signInError } =
      await anonClient.auth.signInWithPassword({
        email,
        password: signInPassword,
      });

    if (signInError || !signInData.session) {
      console.error("Sign-in failed:", signInError);
      return new Response(
        JSON.stringify({ error: "Sign-in failed" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        session: signInData.session,
        profile: {
          id: profile.id,
          profileName: profile.profile_name,
          email: profile.email,
          isAdmin: profile.is_admin,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("profile-auth error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
