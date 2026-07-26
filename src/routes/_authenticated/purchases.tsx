import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { restaurantsQuery, vendorsQuery, vaultsQuery, purchasesQuery, type Purchase } from "@/lib/queries";
import { settingsQuery } from "@/lib/settings";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, TableSkeleton, EmptyState } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, AlertTriangle, Eye } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { fmtMoney, fmtDate } from "@/lib/format";
import { uploadImages } from "@/lib/upload";
import { ImageGrid } from "@/components/image-grid";

export const Route = createFileRoute("/_authenticated/purchases")({
  head: () => ({ meta: [{ title: "Purchases — Vendor & Cash Manager" }] }),
  component: PurchasesPage,
});

type FormState = {
  id?: string; restaurant_id: string; vendor_id: string; vault_id: string;
  amount: string; payment_type: "cash" | "credit" | "partial"; amount_paid_now: string;
  details: string; existing_images: string[]; new_files: File[]; purchase_date: string;
};
const empty = (): FormState => ({
  restaurant_id: "", vendor_id: "", vault_id: "", amount: "0", payment_type: "credit",
  amount_paid_now: "0", details: "", existing_images: [], new_files: [],
  purchase_date: new Date().toISOString().slice(0, 10),
});

function PurchasesPage() {
  const qc = useQueryClient();
  const restaurants = useQuery(restaurantsQuery());
  const vendorsAll = useQuery(vendorsQuery());
  const vaultsAll = useQuery(vaultsQuery());
  const purchases = useQuery(purchasesQuery());
  const settings = useQuery(settingsQuery());
  const sym = settings.data?.currency_symbol ?? "$";

  const [form, setForm] = useState<FormState | null>(null);
  const [delTarget, setDelTarget] = useState<Purchase | null>(null);
  const [viewOf, setViewOf] = useState<Purchase | null>(null);
  const [fRest, setFRest] = useState("all");
  const [fVendor, setFVendor] = useState("all");
  const [fType, setFType] = useState<"all" | "cash" | "credit" | "partial">("all");
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");
  const [fMin, setFMin] = useState("");
  const [fMax, setFMax] = useState("");
  const [q, setQ] = useState("");

  const filtered = useMemo(() => (purchases.data ?? []).filter(p =>
    (fRest === "all" || p.restaurant_id === fRest) &&
    (fVendor === "all" || p.vendor_id === fVendor) &&
    (fType === "all" || p.payment_type === fType) &&
    (!fFrom || p.purchase_date >= fFrom) &&
    (!fTo || p.purchase_date <= new Date(new Date(fTo).getTime() + 86400000).toISOString()) &&
    (!fMin || Number(p.amount) >= Number(fMin)) &&
    (!fMax || Number(p.amount) <= Number(fMax)) &&
    (!q || (p.details ?? "").toLowerCase().includes(q.toLowerCase()))
  ), [purchases.data, fRest, fVendor, fType, fFrom, fTo, fMin, fMax, q]);

  const save = useMutation({
    mutationFn: async (f: FormState) => {
      let images = f.existing_images;
      if (f.new_files.length) {
        const uploaded = await uploadImages("purchase-images", f.new_files);
        images = [...images, ...uploaded];
      }
      const amt = Number(f.amount || 0);
      const paid = f.payment_type === "credit" ? 0 : f.payment_type === "cash" ? amt : Number(f.amount_paid_now || 0);
      if (f.payment_type !== "credit" && !f.vault_id) throw new Error("Select a vault for cash/partial payments");
      if (paid > amt) throw new Error("Amount paid cannot exceed total");
      const payload = {
        restaurant_id: f.restaurant_id, vendor_id: f.vendor_id,
        vault_id: f.payment_type === "credit" ? null : f.vault_id,
        amount: amt, payment_type: f.payment_type, amount_paid_now: paid,
        details: f.details || null, invoice_images: images,
        purchase_date: new Date(f.purchase_date).toISOString(),
      };
      if (f.id) { const { error } = await supabase.from("purchases").update(payload).eq("id", f.id); if (error) throw error; }
      else { const { error } = await supabase.from("purchases").insert(payload); if (error) throw error; }
    },
    onSuccess: () => { qc.invalidateQueries(); setForm(null); toast.success("Purchase saved"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (p: Purchase) => { const { error } = await supabase.from("purchases").update({ is_deleted: true }).eq("id", p.id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries(); setDelTarget(null); toast.success("Purchase deleted"); },
    onError: (e: Error) => { toast.error(e.message); setDelTarget(null); },
  });

  const restName = (id: string) => restaurants.data?.find(r => r.id === id)?.name ?? "—";
  const vendorName = (id: string) => vendorsAll.data?.find(v => v.id === id)?.name ?? "—";
  const vaultName = (id: string | null) => id ? (vaultsAll.data?.find(v => v.id === id)?.vault_user_name ?? "—") : "—";

  return (
    <div>
      <PageHeader title="Purchases" description="Record what each restaurant bought from a vendor."
        action={
          <Dialog open={form !== null} onOpenChange={(o) => setForm(o ? empty() : null)}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> New purchase</Button></DialogTrigger>
            <PurchaseForm form={form} setForm={setForm} restaurants={restaurants.data ?? []} vendors={vendorsAll.data ?? []} vaults={vaultsAll.data ?? []} onSave={(f: any) => save.mutate(f)} saving={save.isPending} sym={sym} />
          </Dialog>
        } />

      <div className="grid gap-2 md:grid-cols-4 lg:grid-cols-6 mb-3">
        <Select value={fRest} onValueChange={(v) => { setFRest(v); setFVendor("all"); }}>
          <SelectTrigger><SelectValue placeholder="Restaurant" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All restaurants</SelectItem>{(restaurants.data ?? []).map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={fVendor} onValueChange={setFVendor}>
          <SelectTrigger><SelectValue placeholder="Vendor" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All vendors</SelectItem>{(vendorsAll.data ?? []).filter(v => fRest === "all" || v.restaurant_id === fRest).map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={fType} onValueChange={(v: any) => setFType(v)}>
          <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All types</SelectItem><SelectItem value="cash">Cash</SelectItem><SelectItem value="credit">Credit</SelectItem><SelectItem value="partial">Partial</SelectItem></SelectContent>
        </Select>
        <Input type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} />
        <Input type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} />
        <Input placeholder="Search details…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Input placeholder="Min amount" value={fMin} onChange={(e) => setFMin(e.target.value)} type="number" />
        <Input placeholder="Max amount" value={fMax} onChange={(e) => setFMax(e.target.value)} type="number" />
      </div>

      {purchases.isLoading ? <TableSkeleton /> : filtered.length === 0 ? <EmptyState title="No purchases" description="Record a purchase to see it here." /> : (
        <div className="border rounded-lg bg-card overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Date</TableHead><TableHead>Restaurant</TableHead><TableHead>Vendor</TableHead>
              <TableHead>Type</TableHead><TableHead>Vault</TableHead>
              <TableHead className="text-right">Amount</TableHead><TableHead className="text-right">Paid now</TableHead>
              <TableHead className="text-right">On credit</TableHead><TableHead className="w-[140px]"></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filtered.map(p => {
                const credit = p.payment_type === "credit" ? p.amount : p.payment_type === "cash" ? 0 : Math.max(p.amount - p.amount_paid_now, 0);
                return (
                  <TableRow key={p.id}>
                    <TableCell>{fmtDate(p.purchase_date)}</TableCell>
                    <TableCell>{restName(p.restaurant_id)}</TableCell>
                    <TableCell>{vendorName(p.vendor_id)}</TableCell>
                    <TableCell><Badge variant={p.payment_type === "credit" ? "secondary" : p.payment_type === "cash" ? "default" : "outline"}>{p.payment_type}</Badge></TableCell>
                    <TableCell>{vaultName(p.vault_id)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtMoney(p.amount, sym)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtMoney(p.amount_paid_now, sym)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtMoney(credit, sym)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1 justify-end">
                        <Button size="icon" variant="ghost" onClick={() => setViewOf(p)}><Eye className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => setForm({
                          id: p.id, restaurant_id: p.restaurant_id, vendor_id: p.vendor_id, vault_id: p.vault_id || "",
                          amount: String(p.amount), payment_type: p.payment_type, amount_paid_now: String(p.amount_paid_now),
                          details: p.details || "", existing_images: p.invoice_images, new_files: [],
                          purchase_date: p.purchase_date.slice(0, 10),
                        })}><Pencil className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => setDelTarget(p)}><Trash2 className="h-4 w-4" /></Button>
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
          <AlertDialogHeader><AlertDialogTitle>Delete purchase?</AlertDialogTitle>
            <AlertDialogDescription>This reverses the vendor's payable and returns any paid cash to the vault.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => delTarget && del.mutate(delTarget)}>Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={viewOf !== null} onOpenChange={(o) => !o && setViewOf(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Purchase details</DialogTitle></DialogHeader>
          {viewOf && (
            <div className="space-y-2 text-sm">
              <div><span className="text-muted-foreground">Date:</span> {fmtDate(viewOf.purchase_date)}</div>
              <div><span className="text-muted-foreground">Restaurant:</span> {restName(viewOf.restaurant_id)}</div>
              <div><span className="text-muted-foreground">Vendor:</span> {vendorName(viewOf.vendor_id)}</div>
              <div><span className="text-muted-foreground">Type:</span> {viewOf.payment_type}</div>
              <div><span className="text-muted-foreground">Amount:</span> {fmtMoney(viewOf.amount, sym)}</div>
              <div><span className="text-muted-foreground">Paid now:</span> {fmtMoney(viewOf.amount_paid_now, sym)}</div>
              {viewOf.vault_id && <div><span className="text-muted-foreground">From vault:</span> {vaultName(viewOf.vault_id)}</div>}
              {viewOf.details && <div><span className="text-muted-foreground">Details:</span> {viewOf.details}</div>}
              <div className="pt-2"><ImageGrid bucket="purchase-images" paths={viewOf.invoice_images} /></div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PurchaseForm({ form, setForm, restaurants, vendors, vaults, onSave, saving, sym }: any) {
  if (!form) return null;
  const restVendors = vendors.filter((v: any) => v.restaurant_id === form.restaurant_id);
  const restVaults = vaults.filter((v: any) => v.restaurant_id === form.restaurant_id && v.is_active);
  const selectedVault = restVaults.find((v: any) => v.id === form.vault_id);
  const paid = form.payment_type === "cash" ? Number(form.amount || 0) : form.payment_type === "credit" ? 0 : Number(form.amount_paid_now || 0);
  const overdraft = selectedVault && paid > Number(selectedVault.current_balance);

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader><DialogTitle>{form.id ? "Edit purchase" : "New purchase"}</DialogTitle></DialogHeader>
      {form.id && <div className="text-xs bg-warning/10 text-warning-foreground p-2 rounded border border-warning/30 flex gap-2"><AlertTriangle className="h-4 w-4 shrink-0" /> Editing will re-adjust vendor and vault balances.</div>}
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Restaurant</Label>
            <Select value={form.restaurant_id} onValueChange={(v) => setForm({ ...form, restaurant_id: v, vendor_id: "", vault_id: "" })}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{restaurants.map((r: any) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Vendor</Label>
            <Select value={form.vendor_id} onValueChange={(v) => setForm({ ...form, vendor_id: v })} disabled={!form.restaurant_id}>
              <SelectTrigger><SelectValue placeholder={form.restaurant_id ? "Select vendor" : "Pick a restaurant first"} /></SelectTrigger>
              <SelectContent>{restVendors.map((v: any) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div><Label>Total amount</Label><Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
          <div><Label>Payment type</Label>
            <Select value={form.payment_type} onValueChange={(v: any) => setForm({ ...form, payment_type: v, amount_paid_now: v === "cash" ? form.amount : v === "credit" ? "0" : form.amount_paid_now })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="credit">Full credit</SelectItem><SelectItem value="cash">Full cash</SelectItem><SelectItem value="partial">Partial</SelectItem></SelectContent>
            </Select>
          </div>
          <div><Label>Date</Label><Input type="date" value={form.purchase_date} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} /></div>
        </div>
        {form.payment_type !== "credit" && (
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Vault (cash source)</Label>
              <Select value={form.vault_id} onValueChange={(v) => setForm({ ...form, vault_id: v })} disabled={!form.restaurant_id}>
                <SelectTrigger><SelectValue placeholder="Select vault" /></SelectTrigger>
                <SelectContent>{restVaults.map((v: any) => <SelectItem key={v.id} value={v.id}>{v.vault_user_name} — {fmtMoney(v.current_balance, sym)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {form.payment_type === "partial" && <div><Label>Paid now</Label><Input type="number" step="0.01" value={form.amount_paid_now} onChange={(e) => setForm({ ...form, amount_paid_now: e.target.value })} /></div>}
          </div>
        )}
        {overdraft && <div className="text-xs bg-warning/10 text-warning-foreground p-2 rounded border border-warning/30 flex gap-2"><AlertTriangle className="h-4 w-4 shrink-0" /> Payment exceeds vault's available cash ({fmtMoney(selectedVault!.current_balance, sym)}). This will push the vault negative.</div>}
        <div><Label>Details</Label><Textarea rows={2} value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} placeholder="Optional notes about the items purchased" /></div>
        <div><Label>Invoice images (jpg, png, pdf ≤ 8MB)</Label>
          <Input type="file" multiple accept="image/*,application/pdf" onChange={(e) => setForm({ ...form, new_files: Array.from(e.target.files ?? []) })} />
          {form.existing_images.length > 0 && <div className="mt-2"><ImageGrid bucket="purchase-images" paths={form.existing_images} /></div>}
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={() => setForm(null)}>Cancel</Button>
        <Button onClick={() => onSave(form)} disabled={saving || !form.restaurant_id || !form.vendor_id || Number(form.amount) <= 0}>{saving ? "Saving…" : "Save purchase"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}
