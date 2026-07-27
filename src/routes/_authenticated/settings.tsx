import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { settingsQuery } from "@/lib/settings";
import { useSession, useIsAdmin } from "@/hooks/use-session";
import { PageHeader, TableSkeleton, EmptyState } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, KeyRound } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { fmtDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — Vendor & Cash Manager" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div>
      <PageHeader title="Settings" description="Manage app settings, users, and view the audit log." />
      <Tabs defaultValue="app">
        <TabsList>
          <TabsTrigger value="app">App</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="audit">Audit log</TabsTrigger>
        </TabsList>
        <TabsContent value="app" className="pt-4"><AppSettingsPanel /></TabsContent>
        <TabsContent value="users" className="pt-4"><UsersPanel /></TabsContent>
        <TabsContent value="audit" className="pt-4"><AuditPanel /></TabsContent>
      </Tabs>
    </div>
  );
}

function AppSettingsPanel() {
  const qc = useQueryClient();
  const { isAdmin } = useSession();
  const s = useQuery(settingsQuery());
  const [sym, setSym] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const saved = s.data ?? { currency_symbol: "$", business_name: "My Restaurant Group", currency_code: "USD" };
  const mut = useMutation({
    mutationFn: async () => {
      const payload: any = {
        id: 1,
        currency_symbol: sym ?? saved.currency_symbol,
        business_name: name ?? saved.business_name,
        currency_code: code ?? saved.currency_code,
      };
      const { error } = await supabase.from("app_settings").upsert(payload);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["app_settings"] }); toast.success("Settings saved"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const clearAll = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("clear_all_business_data");
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries();
      setConfirmClear(false); setConfirmText("");
      toast.success("All business data cleared");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="max-w-md space-y-8">
      <div className="space-y-3">
        <div><Label>Business name</Label><Input defaultValue={saved.business_name} onChange={(e) => setName(e.target.value)} /></div>
        <div><Label>Currency symbol</Label><Input defaultValue={saved.currency_symbol} onChange={(e) => setSym(e.target.value)} maxLength={3} /></div>
        <div><Label>Currency code</Label><Input defaultValue={saved.currency_code} onChange={(e) => setCode(e.target.value)} maxLength={5} /></div>
        <Button onClick={() => mut.mutate()} disabled={mut.isPending}>{mut.isPending ? "Saving…" : "Save settings"}</Button>
      </div>

      {isAdmin && (
        <div className="border border-destructive/40 rounded-lg p-4 space-y-2">
          <div className="font-semibold text-destructive">Danger zone</div>
          <p className="text-sm text-muted-foreground">
            Permanently delete all restaurants, vendors, vaults, purchases, payments, and audit log entries. Users and app settings are kept. This cannot be undone.
          </p>
          <Button variant="destructive" onClick={() => setConfirmClear(true)}>
            <Trash2 className="h-4 w-4 mr-1" /> Clear all software data
          </Button>
        </div>
      )}

      <AlertDialog open={confirmClear} onOpenChange={(o) => { if (!o) { setConfirmClear(false); setConfirmText(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all business data?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete every restaurant, vendor, vault, purchase, payment, and audit entry. Type <b>CLEAR</b> to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="Type CLEAR" />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={confirmText !== "CLEAR" || clearAll.isPending}
              onClick={(e) => { e.preventDefault(); clearAll.mutate(); }}
            >
              {clearAll.isPending ? "Clearing…" : "Yes, clear everything"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

type UserRow = { id: string; email: string; display_name: string | null; role: "admin" | "staff" | null; created_at: string };

function UsersPanel() {
  const { session } = useSession();
  const qc = useQueryClient();
  const users = useQuery({
    queryKey: ["users-list"],
    queryFn: async (): Promise<UserRow[]> => {
      const [{ data: profiles }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("id, email, display_name, created_at").order("created_at"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      return (profiles ?? []).map((p: any) => ({
        ...p, role: (roles ?? []).find((r: any) => r.user_id === p.id)?.role ?? null,
      }));
    },
  });

  const [openNew, setOpenNew] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", display_name: "", role: "staff" as "admin" | "staff" });
  const [resetTarget, setResetTarget] = useState<UserRow | null>(null);
  const [resetPass, setResetPass] = useState("");
  const [delTarget, setDelTarget] = useState<UserRow | null>(null);

  const call = async (body: any) => {
    const token = session?.access_token;
    const res = await fetch("/api/public/admin-users", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || "Failed");
    return json;
  };

  const create = useMutation({
    mutationFn: () => call({ action: "create", ...form }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users-list"] }); setOpenNew(false); setForm({ email: "", password: "", display_name: "", role: "staff" }); toast.success("User created"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (u: UserRow) => call({ action: "delete", user_id: u.id }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users-list"] }); setDelTarget(null); toast.success("User deleted"); },
    onError: (e: Error) => { toast.error(e.message); setDelTarget(null); },
  });
  const reset = useMutation({
    mutationFn: () => call({ action: "reset_password", user_id: resetTarget!.id, password: resetPass }),
    onSuccess: () => { setResetTarget(null); setResetPass(""); toast.success("Password reset"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const setRole = useMutation({
    mutationFn: (v: { u: UserRow; role: "admin" | "staff" }) => call({ action: "set_role", user_id: v.u.id, role: v.role }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users-list"] }); toast.success("Role updated"); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <div className="flex justify-end mb-2">
        <Dialog open={openNew} onOpenChange={setOpenNew}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> New user</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New user</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Display name</Label><Input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} /></div>
              <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div><Label>Temporary password</Label><Input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
              <div><Label>Role</Label>
                <Select value={form.role} onValueChange={(v: any) => setForm({ ...form, role: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="staff">Staff</SelectItem><SelectItem value="admin">Admin</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpenNew(false)}>Cancel</Button>
              <Button onClick={() => create.mutate()} disabled={create.isPending || !form.email || form.password.length < 6}>{create.isPending ? "Creating…" : "Create"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {users.isLoading ? <TableSkeleton /> : (users.data ?? []).length === 0 ? <EmptyState title="No users" /> : (
        <div className="border rounded-lg bg-card">
          <Table>
            <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Role</TableHead><TableHead>Created</TableHead><TableHead className="w-[160px]"></TableHead></TableRow></TableHeader>
            <TableBody>
              {(users.data ?? []).map(u => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.display_name || "—"}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>
                    <Select value={u.role ?? "staff"} onValueChange={(v: any) => setRole.mutate({ u, role: v })} disabled={u.id === session?.user.id}>
                      <SelectTrigger className="h-8 w-[110px]"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="staff">Staff</SelectItem><SelectItem value="admin">Admin</SelectItem></SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>{fmtDate(u.created_at)}</TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-end">
                      <Button size="icon" variant="ghost" onClick={() => setResetTarget(u)}><KeyRound className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" disabled={u.id === session?.user.id} onClick={() => setDelTarget(u)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={resetTarget !== null} onOpenChange={(o) => !o && setResetTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reset password for {resetTarget?.email}</DialogTitle></DialogHeader>
          <div><Label>New password</Label><Input value={resetPass} onChange={(e) => setResetPass(e.target.value)} /></div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setResetTarget(null)}>Cancel</Button>
            <Button onClick={() => reset.mutate()} disabled={reset.isPending || resetPass.length < 6}>Reset</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={delTarget !== null} onOpenChange={(o) => !o && setDelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete user?</AlertDialogTitle>
            <AlertDialogDescription>This removes the login for {delTarget?.email}. Their historical records remain.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => delTarget && del.mutate(delTarget)}>Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AuditPanel() {
  const q = useQuery({
    queryKey: ["audit-log"],
    queryFn: async () => {
      const { data, error } = await supabase.from("activity_log").select("*").order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });
  const [search, setSearch] = useState("");
  const rows = (q.data ?? []).filter((r: any) =>
    !search || JSON.stringify(r).toLowerCase().includes(search.toLowerCase())
  );
  return (
    <div>
      <div className="mb-3 max-w-sm"><Input placeholder="Search log…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
      {q.isLoading ? <TableSkeleton /> : rows.length === 0 ? <EmptyState title="No activity yet" /> : (
        <div className="border rounded-lg bg-card overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Action</TableHead><TableHead>Entity</TableHead><TableHead>Actor</TableHead><TableHead>Details</TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell>{fmtDate(r.created_at)}</TableCell>
                  <TableCell><Badge variant="outline">{r.action}</Badge></TableCell>
                  <TableCell>{r.entity}{r.entity_id ? ` #${String(r.entity_id).slice(0, 8)}` : ""}</TableCell>
                  <TableCell className="text-xs">{r.actor_email ?? r.actor_id?.slice(0, 8) ?? "—"}</TableCell>
                  <TableCell className="max-w-[420px] truncate text-xs text-muted-foreground">{r.details ? JSON.stringify(r.details) : ""}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
