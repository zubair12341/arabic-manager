import { createFileRoute } from "@tanstack/react-router";

// Idempotent admin bootstrap. Creates admin@software.com / Admin123 with admin role on first hit.
export const Route = createFileRoute("/api/public/bootstrap-admin")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const EMAIL = "admin@software.com";
        const PASSWORD = "Admin123";

        // Check if any user with that email already exists via profiles
        const { data: existing } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("email", EMAIL)
          .maybeSingle();

        let userId = existing?.id as string | undefined;

        if (!userId) {
          const { data: created, error: cErr } = await supabaseAdmin.auth.admin.createUser({
            email: EMAIL,
            password: PASSWORD,
            email_confirm: true,
            user_metadata: { display_name: "Administrator" },
          });
          if (cErr) {
            return new Response(JSON.stringify({ ok: false, error: cErr.message }), {
              status: 500,
              headers: { "content-type": "application/json" },
            });
          }
          userId = created.user?.id;
        }

        if (userId) {
          await supabaseAdmin
            .from("user_roles")
            .upsert({ user_id: userId, role: "admin" }, { onConflict: "user_id,role" });
        }

        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
