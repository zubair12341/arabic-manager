import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Wallet } from "lucide-react";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in — Vendor & Cash Manager" },
      { name: "description", content: "Secure sign-in to the multi-restaurant vendor and cash management console." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const router = useRouter();
  const [email, setEmail] = useState("admin@software.com");
  const [password, setPassword] = useState("Admin123");
  const [submitting, setSubmitting] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(true);

  useEffect(() => {
    // Fire-and-forget admin bootstrap so first sign-in works out of the box.
    fetch("/api/public/bootstrap-admin", { method: "POST" })
      .catch(() => {})
      .finally(() => setBootstrapping(false));
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setSubmitting(false);
    if (error) {
      toast.error("Sign-in failed", { description: error.message });
      return;
    }
    await router.invalidate();
    navigate({ to: "/dashboard", replace: true });
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between bg-sidebar text-sidebar-foreground p-12">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-sidebar-primary text-sidebar-primary-foreground grid place-items-center">
            <Wallet className="h-5 w-5" />
          </div>
          <span className="text-lg font-semibold tracking-tight">Vendor & Cash Manager</span>
        </div>
        <div className="space-y-4 max-w-md">
          <h1 className="text-3xl font-semibold tracking-tight">Every rupee, traceable.</h1>
          <p className="text-sm opacity-80">
            Manage vendors, vault cash, purchases and payments across all your restaurants with airtight ledgers and shareable statements.
          </p>
        </div>
        <p className="text-xs opacity-60">© {new Date().getFullYear()} — Internal business console</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>Use your work email and password. Contact an administrator if you don't have access.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
              </div>
              <Button type="submit" className="w-full" disabled={submitting || bootstrapping}>
                {(submitting || bootstrapping) && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {bootstrapping ? "Preparing…" : submitting ? "Signing in…" : "Sign in"}
              </Button>
              <p className="text-xs text-muted-foreground text-center pt-2">
                Default admin: <span className="font-mono">admin@software.com</span> / <span className="font-mono">Admin123</span>
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
