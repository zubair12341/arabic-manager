import { createFileRoute } from "@tanstack/react-router";

// Admin-only server functions for user management.
export const Route = createFileRoute("/api/public/admin-users")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization")?.replace("Bearer ", "");
        if (!auth) return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), { status: 401 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: udata } = await supabaseAdmin.auth.getUser(auth);
        const caller = udata.user;
        if (!caller) return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), { status: 401 });
        const { data: roleRow } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", caller.id).eq("role", "admin").maybeSingle();
        if (!roleRow) return new Response(JSON.stringify({ ok: false, error: "Forbidden" }), { status: 403 });

        const body = await request.json() as { action: string; email?: string; password?: string; display_name?: string; role?: "admin" | "staff"; user_id?: string };

        if (body.action === "create") {
          const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
            email: body.email!, password: body.password!, email_confirm: true,
            user_metadata: { display_name: body.display_name ?? body.email },
          });
          if (error) return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 400 });
          await supabaseAdmin.from("user_roles").upsert({ user_id: created.user!.id, role: body.role ?? "staff" }, { onConflict: "user_id,role" });
          return new Response(JSON.stringify({ ok: true, id: created.user!.id }));
        }

        if (body.action === "delete") {
          if (body.user_id === caller.id) return new Response(JSON.stringify({ ok: false, error: "Cannot delete yourself" }), { status: 400 });
          const { error } = await supabaseAdmin.auth.admin.deleteUser(body.user_id!);
          if (error) return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 400 });
          return new Response(JSON.stringify({ ok: true }));
        }

        if (body.action === "reset_password") {
          const { error } = await supabaseAdmin.auth.admin.updateUserById(body.user_id!, { password: body.password! });
          if (error) return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 400 });
          return new Response(JSON.stringify({ ok: true }));
        }

        if (body.action === "set_role") {
          await supabaseAdmin.from("user_roles").delete().eq("user_id", body.user_id!);
          await supabaseAdmin.from("user_roles").insert({ user_id: body.user_id!, role: body.role! });
          return new Response(JSON.stringify({ ok: true }));
        }

        return new Response(JSON.stringify({ ok: false, error: "Unknown action" }), { status: 400 });
      },
    },
  },
});
