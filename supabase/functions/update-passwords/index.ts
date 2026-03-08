import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const UPDATES = [
  { id: "1c94de7c-753a-4c78-829a-8aac8bb06b65", password: "etnik2025!" },
  { id: "a5c86826-f2f4-49cd-a93c-6de81a325054", password: "genc2025!" },
  { id: "026d4942-c894-43e5-a25f-b4870988936e", password: "leonit2025!" },
  { id: "c15e9619-8579-4458-8015-9d9aaa833777", password: "rajmond2025!" },
  { id: "7b368e31-ee3c-4fa9-8c6f-7d4d6d1e5370", password: "renat2025!" },
];

Deno.serve(async () => {
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const results = [];
  for (const u of UPDATES) {
    const { error } = await admin.auth.admin.updateUserById(u.id, { password: u.password });
    results.push({ id: u.id, status: error ? "error" : "updated", error: error?.message });
  }

  return new Response(JSON.stringify({ results }), {
    headers: { "Content-Type": "application/json" },
  });
});
