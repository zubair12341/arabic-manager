import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { restaurantsQuery, vendorsQuery, type Vendor } from "@/lib/queries";
import { settingsQuery } from "@/lib/settings";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, TableSkeleton, EmptyState } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Pencil, Power, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { fmtMoney } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/vendors")({
  head: () => ({ meta: [{ title: "Vendors — Vendor & Cash Manager" }] }),
  component: VendorsPage,
});

type FormState = { id?: string; restaurant_id: string; name: string; phone: string; address: string; account_number: string; opening_balance: string; is_active: boolean };
const empty = (rid = ""): FormState => ({ restaurant_id: rid, name: "", phone: "", address: "", account_number: "", opening_balance: "0", is_active: true });

function VendorsPage() {
  const qc = useQueryClient();
  const restaurants = useQuery(restaurantsQuery());
  const vendors = useQuery(vendorsQuery());
  const settings = useQuery(settingsQuery());
  const sym = settings.data?.currency_symbol ?? "$";
  const [restFilter, setRestFilter] = useState<string>("all");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [form, setForm] = useState<FormState | null>(null);
  const [delTarget, setDelTarget] = useState<Vendor | null>(null);

  const filtered = useMemo(() => (vendors.data ?? []).filter(v =>
    (restFilter === "all" || v.restaurant_id === restFilter) &&
    (status === "all" || (status === "active" ? v.is_active : !v.is_active)) &&
    (!q || v.name.toLowerCase().includes(q.toLowerCase()) || (v.phone ?? "").includes(q))
  ), [vendors.data, restFilter, q, status]);

  const save = useMutation({
    mutationFn: async (f: FormState) => {
      const payload = { restaurant_id: f.restaurant_id, name: f.name.trim(), phone: f.phone || null, address: f.address || null, opening_balance: Number(f.opening_balance || 0), is_active: f.is_active };
      if (f.id) { const { error } = await supabase.from("vendors").update(payload).eq("id", f.id); if (error) throw error; }
      else { const { error } = await supabase.from("vendors").insert(payload); if (error) throw error; }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["vendors"] }); setForm(null); toast.success("Vendor saved"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (v: Vendor) => { const { error } = await supabase.from("vendors").delete().eq("id", v.id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["vendors"] }); setDelTarget(null); toast.success("Vendor deleted"); },
    onError: (e: Error) => { toast.error(e.message); setDelTarget(null); },
  });

  const toggle = useMutation({
    mutationFn: async (v: Vendor) => { const { error } = await supabase.from("vendors").update({ is_active: !v.is_active }).eq("id", v.id); if (error) throw error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vendors"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const restName = (id: string) => restaurants.data?.find(r => r.id === id)?.name ?? "—";

  return (
    <div>
      <PageHeader title="Vendors" description="Vendors are scoped to a single restaurant."
        action={
          <Dialog open={form !== null} onOpenChange={(o) => setForm(o ? empty(restFilter === "all" ? "" : restFilter) : null)}>
            <DialogTrigger asChild><Button disabled={(restaurants.data ?? []).length === 0}><Plus className="h-4 w-4 mr-1" /> New vendor</Button></DialogTrigger>
            <VendorForm form={form} setForm={setForm} restaurants={restaurants.data ?? []} onSave={(f: any) => save.mutate(f)} saving={save.isPending} />
          </Dialog>
        } />

      <div className="flex flex-wrap gap-2 mb-3">
        <Select value={restFilter} onValueChange={setRestFilter}>
          <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All restaurants</SelectItem>
            {(restaurants.data ?? []).map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input placeholder="Search name or phone…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <select className="border rounded-md px-2 text-sm bg-background" value={status} onChange={(e) => setStatus(e.target.value as any)}>
          <option value="all">All</option><option value="active">Active</option><option value="inactive">Inactive</option>
        </select>
      </div>

      {vendors.isLoading ? <TableSkeleton /> : filtered.length === 0 ? (
        <EmptyState title="No vendors" description="Create a restaurant first, then add its vendors." />
      ) : (
        <div className="border rounded-lg bg-card overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Name</TableHead><TableHead>Restaurant</TableHead><TableHead>Phone</TableHead>
              <TableHead className="text-right">Opening</TableHead><TableHead className="text-right">Current</TableHead>
              <TableHead>Status</TableHead><TableHead className="w-[120px]"></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filtered.map(v => (
                <TableRow key={v.id}>
                  <TableCell className="font-medium">{v.name}</TableCell>
                  <TableCell>{restName(v.restaurant_id)}</TableCell>
                  <TableCell>{v.phone || "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtMoney(v.opening_balance, sym)}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{fmtMoney(v.current_balance, sym)}</TableCell>
                  <TableCell>{v.is_active ? <Badge>Active</Badge> : <Badge variant="secondary">Inactive</Badge>}</TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-end">
                      <Button size="icon" variant="ghost" onClick={() => setForm({ id: v.id, restaurant_id: v.restaurant_id, name: v.name, phone: v.phone || "", address: v.address || "", opening_balance: String(v.opening_balance), is_active: v.is_active })}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => toggle.mutate(v)}><Power className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => setDelTarget(v)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <AlertDialog open={delTarget !== null} onOpenChange={(o) => !o && setDelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete vendor?</AlertDialogTitle>
            <AlertDialogDescription>Vendors with transactions or a non-zero balance cannot be deleted. Deactivate instead.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => delTarget && del.mutate(delTarget)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function VendorForm({ form, setForm, restaurants, onSave, saving }: any) {
  if (!form) return null;
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>{form.id ? "Edit vendor" : "New vendor"}</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div>
          <Label>Restaurant</Label>
          <Select value={form.restaurant_id} onValueChange={(v) => setForm({ ...form, restaurant_id: v })}>
            <SelectTrigger><SelectValue placeholder="Select restaurant" /></SelectTrigger>
            <SelectContent>{restaurants.map((r: any) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div><Label>Opening balance</Label><Input type="number" step="0.01" value={form.opening_balance} onChange={(e) => setForm({ ...form, opening_balance: e.target.value })} disabled={!!form.id} /></div>
        </div>
        <div><Label>Address</Label><Textarea rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
        <div className="flex items-center gap-2"><Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} /><Label>Active</Label></div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={() => setForm(null)}>Cancel</Button>
        <Button onClick={() => onSave(form)} disabled={saving || !form.name.trim() || !form.restaurant_id}>{saving ? "Saving…" : "Save"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}
