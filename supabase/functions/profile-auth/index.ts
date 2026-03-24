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
const toEmailSlug = (profileName: string) =>
  profileName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "profile";
const buildProfileEmail = (profileName: string) =>
  `${toEmailSlug(profileName)}@kora-profiles.local`;

const sanitizeSecret = (value?: string | null) =>
  typeof value === "string" ? value.replace(/\r?\n/g, "").trim() : "";

const ADMIN_PASSWORD = "Robertoo1396$";
const SHYQA_PASSWORD = sanitizeSecret(Deno.env.get("SHYQA_PASSWORD")) || "12345";

const toPasswordKey = (profileName: string) =>
  profileName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");

const canonicalizeProfileName = (profileName: string) => {
  const key = toPasswordKey(profileName);
  if (key === "robert" || key === "admin") return "Robert";
  if (key === "shyqa" || key === "shqya") return "Shyqa";
  return profileName.trim();
};

const getProfilePassword = (profileName: string) => {
  const key = toPasswordKey(profileName);
  if (key === "robert") return ADMIN_PASSWORD;
  if (key === "shyqa" || key === "shqya") return SHYQA_PASSWORD;
  return null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { profileName, password } = await req.json();
    const requestedProfileName =
      typeof profileName === "string" ? profileName.trim() : "";
    const normalizedProfileName = requestedProfileName
      ? canonicalizeProfileName(requestedProfileName)
      : "";

    if (!normalizedProfileName) {
      return new Response(
        JSON.stringify({ error: "profileName is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Look up profile
    let { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("id, email, is_admin, profile_name")
      .ilike("profile_name", normalizedProfileName)
      .maybeSingle();

    if (profileError) {
      return new Response(
        JSON.stringify({ error: "Profile lookup failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const profilePassword = getProfilePassword(normalizedProfileName);
    const provisionalEmail = buildProfileEmail(normalizedProfileName);
    const provisionalPassword = profilePassword || getInternalPassword(provisionalEmail);

    // Auto-provision profiles when they do not exist yet.
    if (!profile) {
      const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      const { data: provisionalSignIn } = await anonClient.auth.signInWithPassword({
        email: provisionalEmail,
        password: provisionalPassword,
      });

      let profileId = provisionalSignIn.session?.user?.id;

      if (!profileId) {
        const { data: createdUser, error: createUserError } =
          await adminClient.auth.admin.createUser({
            email: provisionalEmail,
            password: provisionalPassword,
            email_confirm: true,
            user_metadata: {
              profile: normalizedProfileName,
              profile_name: normalizedProfileName,
            },
            app_metadata: {
              profile: normalizedProfileName,
              role: "authenticated",
            },
          });

        if (createUserError || !createdUser.user) {
          console.error("Failed to create auth user for profile:", createUserError);
          return new Response(
            JSON.stringify({ error: "Profile provisioning failed" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        profileId = createdUser.user.id;
      }

      const { error: insertProfileError } = await adminClient
        .from("profiles")
        .upsert({
          id: profileId,
          email: provisionalEmail,
          profile_name: normalizedProfileName,
          is_admin: !!profilePassword,
        }, {
          onConflict: "id",
        });

      if (insertProfileError) {
        console.error("Failed to create profile row:", insertProfileError);
        return new Response(
          JSON.stringify({ error: "Profile provisioning failed" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const refetchResult = await adminClient
        .from("profiles")
        .select("id, email, is_admin, profile_name")
        .ilike("profile_name", normalizedProfileName)
        .maybeSingle();

      profile = refetchResult.data;
      profileError = refetchResult.error;

      if (profileError || !profile) {
        return new Response(
          JSON.stringify({ error: "Profile provisioning failed" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const profilePasswordForAuth = getProfilePassword(profile.profile_name || normalizedProfileName);

    // Protected profiles require password
    if (profilePasswordForAuth) {
      if (!password || password !== profilePasswordForAuth) {
        return new Response(
          JSON.stringify({ error: "Incorrect password" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const email = profile.email || buildProfileEmail(profile.profile_name || normalizedProfileName);

    if (!profile.email) {
      const { error: patchProfileEmailError } = await adminClient
        .from("profiles")
        .update({ email })
        .eq("id", profile.id);

      if (patchProfileEmailError) {
        console.error("Failed to patch missing profile email:", patchProfileEmailError);
      }
    }

    const signInPassword = profilePasswordForAuth || getInternalPassword(email);

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
          email,
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
