import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { restaurantsQuery, vendorsQuery, vaultsQuery, paymentsQuery, type Payment } from "@/lib/queries";
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
import { Plus, Pencil, Trash2, AlertTriangle, Eye } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { fmtMoney, fmtDate } from "@/lib/format";
import { uploadImages } from "@/lib/upload";
import { ImageGrid } from "@/components/image-grid";

export const Route = createFileRoute("/_authenticated/payments")({
  head: () => ({ meta: [{ title: "Payments — Vendor & Cash Manager" }] }),
  component: PaymentsPage,
});

type FormState = {
  id?: string; restaurant_id: string; vault_id: string; vendor_id: string;
  amount: string; note: string; existing_images: string[]; new_files: File[]; payment_date: string;
  ackOverpay: boolean;
};
const empty = (): FormState => ({
  restaurant_id: "", vault_id: "", vendor_id: "", amount: "0", note: "",
  existing_images: [], new_files: [], payment_date: new Date().toISOString().slice(0, 10), ackOverpay: false,
});

function PaymentsPage() {
  const qc = useQueryClient();
  const restaurants = useQuery(restaurantsQuery());
  const vendorsAll = useQuery(vendorsQuery());
  const vaultsAll = useQuery(vaultsQuery());
  const payments = useQuery(paymentsQuery());
  const settings = useQuery(settingsQuery());
  const sym = settings.data?.currency_symbol ?? "$";

  const [form, setForm] = useState<FormState | null>(null);
  const [delTarget, setDelTarget] = useState<Payment | null>(null);
  const [viewOf, setViewOf] = useState<Payment | null>(null);
  const [fRest, setFRest] = useState("all");
  const [fVendor, setFVendor] = useState("all");
  const [fVault, setFVault] = useState("all");
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");
  const [fMin, setFMin] = useState(""); const [fMax, setFMax] = useState("");
  const [q, setQ] = useState("");

  const filtered = useMemo(() => (payments.data ?? []).filter(p =>
    (fRest === "all" || p.restaurant_id === fRest) &&
    (fVendor === "all" || p.vendor_id === fVendor) &&
    (fVault === "all" || p.vault_id === fVault) &&
    (!fFrom || p.payment_date >= fFrom) &&
    (!fTo || p.payment_date <= new Date(new Date(fTo).getTime() + 86400000).toISOString()) &&
    (!fMin || Number(p.amount) >= Number(fMin)) &&
    (!fMax || Number(p.amount) <= Number(fMax)) &&
    (!q || (p.note ?? "").toLowerCase().includes(q.toLowerCase()))
  ), [payments.data, fRest, fVendor, fVault, fFrom, fTo, fMin, fMax, q]);

  const save = useMutation({
    mutationFn: async (f: FormState) => {
      let images = f.existing_images;
      if (f.new_files.length) {
        const uploaded = await uploadImages("payment-images", f.new_files);
        images = [...images, ...uploaded];
      }
      const payload = {
        restaurant_id: f.restaurant_id, vault_id: f.vault_id, vendor_id: f.vendor_id,
        amount: Number(f.amount || 0), note: f.note || null, payment_images: images,
        payment_date: new Date(f.payment_date).toISOString(),
      };
      if (f.id) { const { error } = await supabase.from("payments").update(payload).eq("id", f.id); if (error) throw error; }
      else { const { error } = await supabase.from("payments").insert(payload); if (error) throw error; }
    },
    onSuccess: () => { qc.invalidateQueries(); setForm(null); toast.success("Payment saved"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (p: Payment) => { const { error } = await supabase.from("payments").update({ is_deleted: true }).eq("id", p.id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries(); setDelTarget(null); toast.success("Payment deleted"); },
    onError: (e: Error) => { toast.error(e.message); setDelTarget(null); },
  });

  const restName = (id: string) => restaurants.data?.find(r => r.id === id)?.name ?? "—";
  const vendorName = (id: string) => vendorsAll.data?.find(v => v.id === id)?.name ?? "—";
  const vaultName = (id: string) => vaultsAll.data?.find(v => v.id === id)?.vault_user_name ?? "—";

  return (
    <div>
      <PageHeader title="Payments" description="Pay a vendor from a restaurant's vault."
        action={
          <Dialog open={form !== null} onOpenChange={(o) => setForm(o ? empty() : null)}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> New payment</Button></DialogTrigger>
            <PaymentForm form={form} setForm={setForm} restaurants={restaurants.data ?? []} vendors={vendorsAll.data ?? []} vaults={vaultsAll.data ?? []} onSave={(f: any) => save.mutate(f)} saving={save.isPending} sym={sym} />
          </Dialog>
        } />

      <div className="grid gap-2 md:grid-cols-4 lg:grid-cols-6 mb-3">
        <Select value={fRest} onValueChange={(v) => { setFRest(v); setFVendor("all"); setFVault("all"); }}>
          <SelectTrigger><SelectValue placeholder="Restaurant" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All restaurants</SelectItem>{(restaurants.data ?? []).map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={fVendor} onValueChange={setFVendor}>
          <SelectTrigger><SelectValue placeholder="Vendor" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All vendors</SelectItem>{(vendorsAll.data ?? []).filter(v => fRest === "all" || v.restaurant_id === fRest).map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={fVault} onValueChange={setFVault}>
          <SelectTrigger><SelectValue placeholder="Vault" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All vaults</SelectItem>{(vaultsAll.data ?? []).filter(v => fRest === "all" || v.restaurant_id === fRest).map(v => <SelectItem key={v.id} value={v.id}>{v.vault_user_name}</SelectItem>)}</SelectContent>
        </Select>
        <Input type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} />
        <Input type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} />
        <Input placeholder="Search note…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Input placeholder="Min" type="number" value={fMin} onChange={(e) => setFMin(e.target.value)} />
        <Input placeholder="Max" type="number" value={fMax} onChange={(e) => setFMax(e.target.value)} />
      </div>

      {payments.isLoading ? <TableSkeleton /> : filtered.length === 0 ? <EmptyState title="No payments" description="Record a payment to a vendor to see it here." /> : (
        <div className="border rounded-lg bg-card overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Date</TableHead><TableHead>Restaurant</TableHead><TableHead>Vault</TableHead><TableHead>Vendor</TableHead>
              <TableHead className="text-right">Amount</TableHead><TableHead>Note</TableHead><TableHead className="w-[140px]"></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filtered.map(p => (
                <TableRow key={p.id}>
                  <TableCell>{fmtDate(p.payment_date)}</TableCell>
                  <TableCell>{restName(p.restaurant_id)}</TableCell>
                  <TableCell>{vaultName(p.vault_id)}</TableCell>
                  <TableCell>{vendorName(p.vendor_id)}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{fmtMoney(p.amount, sym)}</TableCell>
                  <TableCell className="max-w-[240px] truncate">{p.note}</TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-end">
                      <Button size="icon" variant="ghost" onClick={() => setViewOf(p)}><Eye className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => setForm({
                        id: p.id, restaurant_id: p.restaurant_id, vault_id: p.vault_id, vendor_id: p.vendor_id,
                        amount: String(p.amount), note: p.note || "", existing_images: p.payment_images, new_files: [],
                        payment_date: p.payment_date.slice(0, 10), ackOverpay: true,
                      })}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => setDelTarget(p)}><Trash2 className="h-4 w-4" /></Button>
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
          <AlertDialogHeader><AlertDialogTitle>Delete payment?</AlertDialogTitle>
            <AlertDialogDescription>The vendor's payable will go back up and the vault will get the cash back.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => delTarget && del.mutate(delTarget)}>Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={viewOf !== null} onOpenChange={(o) => !o && setViewOf(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Payment details</DialogTitle></DialogHeader>
          {viewOf && (
            <div className="space-y-2 text-sm">
              <div><span className="text-muted-foreground">Date:</span> {fmtDate(viewOf.payment_date)}</div>
              <div><span className="text-muted-foreground">Restaurant:</span> {restName(viewOf.restaurant_id)}</div>
              <div><span className="text-muted-foreground">Vendor:</span> {vendorName(viewOf.vendor_id)}</div>
              <div><span className="text-muted-foreground">Vault:</span> {vaultName(viewOf.vault_id)}</div>
              <div><span className="text-muted-foreground">Amount:</span> {fmtMoney(viewOf.amount, sym)}</div>
              {viewOf.note && <div><span className="text-muted-foreground">Note:</span> {viewOf.note}</div>}
              <div className="pt-2"><ImageGrid bucket="payment-images" paths={viewOf.payment_images} /></div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PaymentForm({ form, setForm, restaurants, vendors, vaults, onSave, saving, sym }: any) {
  if (!form) return null;
  const restVendors = vendors.filter((v: any) => v.restaurant_id === form.restaurant_id);
  const restVaults = vaults.filter((v: any) => v.restaurant_id === form.restaurant_id);
  const vendor = restVendors.find((v: any) => v.id === form.vendor_id);
  const vault = restVaults.find((v: any) => v.id === form.vault_id);
  const amt = Number(form.amount || 0);
  const overpay = vendor && amt > Number(vendor.current_balance);
  const overdraft = vault && amt > Number(vault.current_balance);
  const needAck = !form.id && (overpay || overdraft);

  return (
    <DialogContent className="max-w-xl">
      <DialogHeader><DialogTitle>{form.id ? "Edit payment" : "New payment"}</DialogTitle></DialogHeader>
      {form.id && <div className="text-xs bg-warning/10 text-warning-foreground p-2 rounded border border-warning/30 flex gap-2"><AlertTriangle className="h-4 w-4 shrink-0" /> Editing will re-adjust vendor and vault balances.</div>}
      <div className="space-y-3">
        <div><Label>Restaurant</Label>
          <Select value={form.restaurant_id} onValueChange={(v) => setForm({ ...form, restaurant_id: v, vault_id: "", vendor_id: "" })}>
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>{restaurants.map((r: any) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Vault</Label>
            <Select value={form.vault_id} onValueChange={(v) => setForm({ ...form, vault_id: v })} disabled={!form.restaurant_id}>
              <SelectTrigger><SelectValue placeholder={form.restaurant_id ? "Select vault" : "Pick restaurant first"} /></SelectTrigger>
              <SelectContent>{restVaults.map((v: any) => <SelectItem key={v.id} value={v.id}>{v.vault_user_name} — {fmtMoney(v.current_balance, sym)}</SelectItem>)}</SelectContent>
            </Select>
            {vault && <div className="text-xs text-muted-foreground mt-1">Available: {fmtMoney(vault.current_balance, sym)}</div>}
          </div>
          <div><Label>Vendor</Label>
            <Select value={form.vendor_id} onValueChange={(v) => setForm({ ...form, vendor_id: v })} disabled={!form.restaurant_id}>
              <SelectTrigger><SelectValue placeholder={form.restaurant_id ? "Select vendor" : "Pick restaurant first"} /></SelectTrigger>
              <SelectContent>{restVendors.map((v: any) => <SelectItem key={v.id} value={v.id}>{v.name} — owed {fmtMoney(v.current_balance, sym)}</SelectItem>)}</SelectContent>
            </Select>
            {vendor && <div className="text-xs text-muted-foreground mt-1">Outstanding: {fmtMoney(vendor.current_balance, sym)}</div>}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Amount</Label><Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value, ackOverpay: false })} /></div>
          <div><Label>Date</Label><Input type="date" value={form.payment_date} onChange={(e) => setForm({ ...form, payment_date: e.target.value })} /></div>
        </div>
        {overpay && <div className="text-xs bg-warning/10 text-warning-foreground p-2 rounded border border-warning/30 flex gap-2"><AlertTriangle className="h-4 w-4 shrink-0" /> Payment exceeds vendor's outstanding balance ({fmtMoney(vendor.current_balance, sym)}). This will create a credit for the vendor.</div>}
        {overdraft && <div className="text-xs bg-warning/10 text-warning-foreground p-2 rounded border border-warning/30 flex gap-2"><AlertTriangle className="h-4 w-4 shrink-0" /> Payment exceeds vault's available cash ({fmtMoney(vault.current_balance, sym)}). This will push the vault negative.</div>}
        {needAck && <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={form.ackOverpay} onChange={(e) => setForm({ ...form, ackOverpay: e.target.checked })} className="mt-0.5" /> I understand and want to proceed anyway.</label>}
        <div><Label>Note</Label><Textarea rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
        <div><Label>Receipt images (jpg, png, pdf ≤ 8MB)</Label>
          <Input type="file" multiple accept="image/*,application/pdf" onChange={(e) => setForm({ ...form, new_files: Array.from(e.target.files ?? []) })} />
          {form.existing_images.length > 0 && <div className="mt-2"><ImageGrid bucket="payment-images" paths={form.existing_images} /></div>}
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={() => setForm(null)}>Cancel</Button>
        <Button onClick={() => onSave(form)} disabled={saving || !form.restaurant_id || !form.vault_id || !form.vendor_id || amt <= 0 || (needAck && !form.ackOverpay)}>{saving ? "Saving…" : "Save payment"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}
