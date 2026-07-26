import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { restaurantsQuery, vendorsQuery, vaultsQuery, type Restaurant } from "@/lib/queries";
import { settingsQuery } from "@/lib/settings";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, TableSkeleton, EmptyState } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Pencil, Power, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { fmtMoney } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/restaurants")({
  head: () => ({ meta: [{ title: "Restaurants — Vendor & Cash Manager" }] }),
  component: RestaurantsPage,
});

type FormState = { id?: string; name: string; address: string; phone: string; opening_cash_balance: string; is_active: boolean };
const empty: FormState = { name: "", address: "", phone: "", opening_cash_balance: "0", is_active: true };

function RestaurantsPage() {
  const qc = useQueryClient();
  const restaurants = useQuery(restaurantsQuery());
  const vendors = useQuery(vendorsQuery());
  const vaults = useQuery(vaultsQuery());
  const settings = useQuery(settingsQuery());
  const sym = settings.data?.currency_symbol ?? "$";
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [form, setForm] = useState<FormState | null>(null);
  const [delTarget, setDelTarget] = useState<Restaurant | null>(null);

  const filtered = useMemo(() => (restaurants.data ?? []).filter(r =>
    (status === "all" || (status === "active" ? r.is_active : !r.is_active)) &&
    (!q || r.name.toLowerCase().includes(q.toLowerCase()) || (r.phone ?? "").includes(q))
  ), [restaurants.data, q, status]);

  const save = useMutation({
    mutationFn: async (f: FormState) => {
      const payload = { name: f.name.trim(), address: f.address || null, phone: f.phone || null, opening_cash_balance: Number(f.opening_cash_balance || 0), is_active: f.is_active };
      if (f.id) {
        const { error } = await supabase.from("restaurants").update(payload).eq("id", f.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("restaurants").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["restaurants"] }); setForm(null); toast.success("Restaurant saved"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (r: Restaurant) => {
      const { error } = await supabase.from("restaurants").delete().eq("id", r.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["restaurants"] }); setDelTarget(null); toast.success("Restaurant deleted"); },
    onError: (e: Error) => { toast.error(e.message); setDelTarget(null); },
  });

  const toggleActive = useMutation({
    mutationFn: async (r: Restaurant) => {
      const { error } = await supabase.from("restaurants").update({ is_active: !r.is_active }).eq("id", r.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["restaurants"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const stat = (rid: string) => {
    const vs = (vendors.data ?? []).filter(v => v.restaurant_id === rid);
    const va = (vaults.data ?? []).filter(v => v.restaurant_id === rid);
    return {
      vendorCount: vs.length,
      outstanding: vs.reduce((s, v) => s + Number(v.current_balance), 0),
      cash: va.reduce((s, v) => s + Number(v.current_balance), 0),
    };
  };

  return (
    <div>
      <PageHeader title="Restaurants" description="Manage your restaurant locations."
        action={
          <Dialog open={form !== null} onOpenChange={(o) => setForm(o ? empty : null)}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> New restaurant</Button></DialogTrigger>
            <RestaurantForm form={form} setForm={setForm} onSave={(f) => save.mutate(f)} saving={save.isPending} />
          </Dialog>
        } />

      <div className="flex flex-wrap gap-2 mb-3">
        <Input placeholder="Search name or phone…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <select className="border rounded-md px-2 text-sm bg-background" value={status} onChange={(e) => setStatus(e.target.value as any)}>
          <option value="all">All</option><option value="active">Active</option><option value="inactive">Inactive</option>
        </select>
      </div>

      {restaurants.isLoading ? <TableSkeleton /> : filtered.length === 0 ? (
        <EmptyState title="No restaurants yet" description="Create your first restaurant to start tracking vendors and cash." />
      ) : (
        <div className="border rounded-lg bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead><TableHead>Phone</TableHead>
                <TableHead className="text-right">Vendors</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead className="text-right">Cash in hand</TableHead>
                <TableHead>Status</TableHead><TableHead className="w-[120px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(r => {
                const s = stat(r.id);
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}<div className="text-xs text-muted-foreground">{r.address}</div></TableCell>
                    <TableCell>{r.phone || "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.vendorCount}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtMoney(s.outstanding, sym)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtMoney(s.cash, sym)}</TableCell>
                    <TableCell>{r.is_active ? <Badge>Active</Badge> : <Badge variant="secondary">Inactive</Badge>}</TableCell>
                    <TableCell>
                      <div className="flex gap-1 justify-end">
                        <Button size="icon" variant="ghost" onClick={() => setForm({ id: r.id, name: r.name, address: r.address || "", phone: r.phone || "", opening_cash_balance: String(r.opening_cash_balance), is_active: r.is_active })}><Pencil className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => toggleActive.mutate(r)} title={r.is_active ? "Deactivate" : "Activate"}><Power className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => setDelTarget(r)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <AlertDialog open={delTarget !== null} onOpenChange={(o) => !o && setDelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete restaurant?</AlertDialogTitle>
            <AlertDialogDescription>
              Restaurants with vendors, vaults, or transactions cannot be deleted. Deactivate instead to keep historical reports intact.
            </AlertDialogDescription>
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

function RestaurantForm({ form, setForm, onSave, saving }: { form: FormState | null; setForm: (f: FormState | null) => void; onSave: (f: FormState) => void; saving: boolean }) {
  if (!form) return null;
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>{form.id ? "Edit restaurant" : "New restaurant"}</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div><Label>Address</Label><Textarea rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div><Label>Opening cash</Label><Input type="number" step="0.01" value={form.opening_cash_balance} onChange={(e) => setForm({ ...form, opening_cash_balance: e.target.value })} /></div>
        </div>
        <div className="flex items-center gap-2"><Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} /><Label>Active</Label></div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={() => setForm(null)}>Cancel</Button>
        <Button onClick={() => onSave(form)} disabled={saving || !form.name.trim()}>{saving ? "Saving…" : "Save"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}
