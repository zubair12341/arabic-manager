import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { restaurantsQuery, vaultsQuery, purchasesQuery, paymentsQuery, vaultDepositsQuery, expensesQuery, vendorsQuery, type Vault, type VaultDeposit } from "@/lib/queries";
import { buildTxns } from "@/lib/report-data";
import { newDoc, docHeader, table as pdfTable, summaryRows, save as savePdf, pdfMoney, pdfDate, pdfDateTime } from "@/lib/pdf";
import { settingsQuery } from "@/lib/settings";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, TableSkeleton, EmptyState, StatCard } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, Power, Trash2, BanknoteArrowUp } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { fmtMoney, fmtDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/vaults")({
  head: () => ({ meta: [{ title: "Vaults / Cash in Hand — Vendor & Cash Manager" }] }),
  component: VaultsPage,
});

type FormState = { id?: string; restaurant_id: string; vault_user_name: string; opening_balance: string; is_active: boolean };
const empty = (rid = ""): FormState => ({ restaurant_id: rid, vault_user_name: "", opening_balance: "0", is_active: true });

type DepositForm = { id?: string; restaurant_id: string; vault_id: string; amount: string; note: string; deposit_date: string };
const toLocalInput = (iso?: string) => {
  const d = iso ? new Date(iso) : new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
};
const emptyDeposit = (vault?: Vault): DepositForm => ({
  restaurant_id: vault?.restaurant_id ?? "", vault_id: vault?.id ?? "", amount: "", note: "", deposit_date: toLocalInput(),
});

function VaultsPage() {
  const qc = useQueryClient();
  const restaurants = useQuery(restaurantsQuery());
  const vaults = useQuery(vaultsQuery());
  const purchases = useQuery(purchasesQuery());
  const payments = useQuery(paymentsQuery());
  const deposits = useQuery(vaultDepositsQuery());
  const settings = useQuery(settingsQuery());
  const sym = settings.data?.currency_symbol ?? "$";
  const [restFilter, setRestFilter] = useState<string>("all");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [form, setForm] = useState<FormState | null>(null);
  const [delTarget, setDelTarget] = useState<Vault | null>(null);
  const [historyOf, setHistoryOf] = useState<Vault | null>(null);
  const [depForm, setDepForm] = useState<DepositForm | null>(null);
  const [depDel, setDepDel] = useState<VaultDeposit | null>(null);

  const filtered = useMemo(() => (vaults.data ?? []).filter(v =>
    (restFilter === "all" || v.restaurant_id === restFilter) &&
    (status === "all" || (status === "active" ? v.is_active : !v.is_active)) &&
    (!q || v.vault_user_name.toLowerCase().includes(q.toLowerCase()))
  ), [vaults.data, restFilter, q, status]);

  const restCash = useMemo(() => restFilter === "all" ? 0 : (vaults.data ?? []).filter(v => v.restaurant_id === restFilter).reduce((s, v) => s + Number(v.current_balance), 0), [vaults.data, restFilter]);

  const save = useMutation({
    mutationFn: async (f: FormState) => {
      const payload = { restaurant_id: f.restaurant_id, vault_user_name: f.vault_user_name.trim(), opening_balance: Number(f.opening_balance || 0), is_active: f.is_active };
      if (f.id) { const { error } = await supabase.from("vaults").update(payload).eq("id", f.id); if (error) throw error; }
      else { const { error } = await supabase.from("vaults").insert(payload); if (error) throw error; }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["vaults"] }); setForm(null); toast.success("Vault saved"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (v: Vault) => { const { error } = await supabase.from("vaults").delete().eq("id", v.id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["vaults"] }); setDelTarget(null); toast.success("Vault deleted"); },
    onError: (e: Error) => { toast.error(e.message); setDelTarget(null); },
  });

  const toggle = useMutation({
    mutationFn: async (v: Vault) => { const { error } = await supabase.from("vaults").update({ is_active: !v.is_active }).eq("id", v.id); if (error) throw error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vaults"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const invalidateCash = () => {
    qc.invalidateQueries({ queryKey: ["vault_deposits"] });
    qc.invalidateQueries({ queryKey: ["vaults"] });
  };

  const saveDeposit = useMutation({
    mutationFn: async (f: DepositForm) => {
      const payload = {
        restaurant_id: f.restaurant_id, vault_id: f.vault_id,
        amount: Number(f.amount || 0), note: f.note.trim() || null,
        deposit_date: new Date(f.deposit_date).toISOString(),
      };
      if (f.id) { const { error } = await supabase.from("vault_deposits").update(payload).eq("id", f.id); if (error) throw error; }
      else { const { error } = await supabase.from("vault_deposits").insert(payload); if (error) throw error; }
    },
    onSuccess: () => { invalidateCash(); setDepForm(null); toast.success("Cash entry saved"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteDeposit = useMutation({
    mutationFn: async (d: VaultDeposit) => { const { error } = await supabase.from("vault_deposits").delete().eq("id", d.id); if (error) throw error; },
    onSuccess: () => { invalidateCash(); setDepDel(null); toast.success("Cash entry deleted"); },
    onError: (e: Error) => { toast.error(e.message); setDepDel(null); },
  });

  const restName = (id: string) => restaurants.data?.find(r => r.id === id)?.name ?? "—";
  const vaultName = (id: string) => vaults.data?.find(v => v.id === id)?.vault_user_name ?? "—";

  const depositList = useMemo(() => (deposits.data ?? []).filter(d =>
    restFilter === "all" || d.restaurant_id === restFilter
  ), [deposits.data, restFilter]);

  const vaultTxns = useMemo(() => {
    if (!historyOf) return [];
    const ps = (purchases.data ?? []).filter(p => p.vault_id === historyOf.id && Number(p.amount_paid_now) > 0)
      .map(p => ({ id: p.id, date: p.purchase_date, kind: "Purchase (cash portion)", amount: -Number(p.amount_paid_now) }));
    const pm = (payments.data ?? []).filter(p => p.vault_id === historyOf.id)
      .map(p => ({ id: p.id, date: p.payment_date, kind: "Payment", amount: -Number(p.amount) }));
    const dp = (deposits.data ?? []).filter(d => d.vault_id === historyOf.id)
      .map(d => ({ id: d.id, date: d.deposit_date, kind: "Cash added", amount: Number(d.amount) }));
    return [...ps, ...pm, ...dp].sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [historyOf, purchases.data, payments.data, deposits.data]);

  return (
    <div>
      <PageHeader title="Vaults / Cash in Hand" description="Manage restaurant cash pockets. Each vault tracks its own current balance."
        action={
          <div className="flex gap-2">
            <Button variant="outline" disabled={(vaults.data ?? []).length === 0} onClick={() => setDepForm(emptyDeposit())}>
              <BanknoteArrowUp className="h-4 w-4 mr-1" /> Add cash
            </Button>
            <Dialog open={form !== null} onOpenChange={(o) => setForm(o ? empty(restFilter === "all" ? "" : restFilter) : null)}>
              <DialogTrigger asChild><Button disabled={(restaurants.data ?? []).length === 0}><Plus className="h-4 w-4 mr-1" /> New vault</Button></DialogTrigger>
              <VaultForm form={form} setForm={setForm} restaurants={restaurants.data ?? []} onSave={(f: any) => save.mutate(f)} saving={save.isPending} />
            </Dialog>
          </div>
        } />

      <div className="flex flex-wrap gap-2 mb-3">
        <Select value={restFilter} onValueChange={setRestFilter}>
          <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All restaurants</SelectItem>
            {(restaurants.data ?? []).map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input placeholder="Search vault name…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <select className="border rounded-md px-2 text-sm bg-background" value={status} onChange={(e) => setStatus(e.target.value as any)}>
          <option value="all">All</option><option value="active">Active</option><option value="inactive">Inactive</option>
        </select>
      </div>

      {restFilter !== "all" && (
        <div className="mb-3"><StatCard label={`Cash in hand — ${restName(restFilter)}`} value={fmtMoney(restCash, sym)} /></div>
      )}

      {vaults.isLoading ? <TableSkeleton /> : filtered.length === 0 ? (
        <EmptyState title="No vaults" description="Add a vault to start tracking a restaurant's cash." />
      ) : (
        <div className="border rounded-lg bg-card overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Vault user</TableHead><TableHead>Restaurant</TableHead>
              <TableHead className="text-right">Opening</TableHead><TableHead className="text-right">Current</TableHead>
              <TableHead>Status</TableHead><TableHead className="w-[220px]"></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filtered.map(v => (
                <TableRow key={v.id}>
                  <TableCell className="font-medium">{v.vault_user_name}</TableCell>
                  <TableCell>{restName(v.restaurant_id)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtMoney(v.opening_balance, sym)}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{fmtMoney(v.current_balance, sym)}</TableCell>
                  <TableCell>{v.is_active ? <Badge>Active</Badge> : <Badge variant="secondary">Inactive</Badge>}</TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-end">
                      <Button size="sm" variant="outline" onClick={() => setDepForm(emptyDeposit(v))}>Add cash</Button>
                      <Button size="sm" variant="outline" onClick={() => setHistoryOf(v)}>History</Button>
                      <Button size="icon" variant="ghost" onClick={() => setForm({ id: v.id, restaurant_id: v.restaurant_id, vault_user_name: v.vault_user_name, opening_balance: String(v.opening_balance), is_active: v.is_active })}><Pencil className="h-4 w-4" /></Button>
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

      <h2 className="text-lg font-semibold mt-8 mb-3">Daily cash added</h2>
      {deposits.isLoading ? <TableSkeleton rows={3} /> : depositList.length === 0 ? (
        <EmptyState title="No cash entries" description="Use “Add cash” to record daily cash handed to a vault user." />
      ) : (
        <div className="border rounded-lg bg-card overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Date</TableHead><TableHead>Vault user</TableHead><TableHead>Restaurant</TableHead>
              <TableHead>Note</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="w-[100px]"></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {depositList.map(d => (
                <TableRow key={d.id}>
                  <TableCell>{fmtDate(d.deposit_date)}</TableCell>
                  <TableCell className="font-medium">{vaultName(d.vault_id)}</TableCell>
                  <TableCell>{restName(d.restaurant_id)}</TableCell>
                  <TableCell className="text-muted-foreground">{d.note ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">+{fmtMoney(d.amount, sym)}</TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-end">
                      <Button size="icon" variant="ghost" onClick={() => setDepForm({ id: d.id, restaurant_id: d.restaurant_id, vault_id: d.vault_id, amount: String(d.amount), note: d.note ?? "", deposit_date: toLocalInput(d.deposit_date) })}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => setDepDel(d)}><Trash2 className="h-4 w-4" /></Button>
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
            <AlertDialogTitle>Delete vault?</AlertDialogTitle>
            <AlertDialogDescription>Vaults with transactions or cash entries cannot be deleted. Deactivate instead.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => delTarget && del.mutate(delTarget)}>Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={depDel !== null} onOpenChange={(o) => !o && setDepDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete cash entry?</AlertDialogTitle>
            <AlertDialogDescription>The vault balance will be reduced by this amount.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => depDel && deleteDeposit.mutate(depDel)}>Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={depForm !== null} onOpenChange={(o) => !o && setDepForm(null)}>
        {depForm && (
          <DialogContent>
            <DialogHeader><DialogTitle>{depForm.id ? "Edit cash entry" : "Add cash to vault"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Restaurant</Label>
                <Select value={depForm.restaurant_id} onValueChange={(v) => setDepForm({ ...depForm, restaurant_id: v, vault_id: "" })}>
                  <SelectTrigger><SelectValue placeholder="Select restaurant" /></SelectTrigger>
                  <SelectContent>{(restaurants.data ?? []).map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Vault user</Label>
                <Select value={depForm.vault_id} onValueChange={(v) => setDepForm({ ...depForm, vault_id: v })} disabled={!depForm.restaurant_id}>
                  <SelectTrigger><SelectValue placeholder="Select vault" /></SelectTrigger>
                  <SelectContent>
                    {(vaults.data ?? []).filter(v => v.restaurant_id === depForm.restaurant_id).map(v => (
                      <SelectItem key={v.id} value={v.id}>{v.vault_user_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Amount</Label><Input type="number" step="0.01" value={depForm.amount} onChange={(e) => setDepForm({ ...depForm, amount: e.target.value })} placeholder="0.00" /></div>
              <div><Label>Date</Label><Input type="datetime-local" value={depForm.deposit_date} onChange={(e) => setDepForm({ ...depForm, deposit_date: e.target.value })} /></div>
              <div><Label>Note</Label><Textarea value={depForm.note} onChange={(e) => setDepForm({ ...depForm, note: e.target.value })} placeholder="e.g. Daily cash handover" /></div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setDepForm(null)}>Cancel</Button>
              <Button onClick={() => saveDeposit.mutate(depForm)} disabled={saveDeposit.isPending || !depForm.vault_id || !depForm.restaurant_id || !Number(depForm.amount)}>{saveDeposit.isPending ? "Saving…" : "Save"}</Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      <Dialog open={historyOf !== null} onOpenChange={(o) => !o && setHistoryOf(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{historyOf?.vault_user_name} — transaction history</DialogTitle></DialogHeader>
          <div className="max-h-[60vh] overflow-auto border rounded-md">
            <Table>
              <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
              <TableBody>
                {vaultTxns.length === 0 ? <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground text-sm py-4">No transactions</TableCell></TableRow> :
                  vaultTxns.map(t => (
                    <TableRow key={t.kind + t.id}>
                      <TableCell>{fmtDate(t.date)}</TableCell><TableCell>{t.kind}</TableCell>
                      <TableCell className="text-right tabular-nums">{t.amount >= 0 ? "+" : "−"}{fmtMoney(Math.abs(t.amount), sym)}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function VaultForm({ form, setForm, restaurants, onSave, saving }: any) {
  if (!form) return null;
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>{form.id ? "Edit vault" : "New vault"}</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div><Label>Restaurant</Label>
          <Select value={form.restaurant_id} onValueChange={(v) => setForm({ ...form, restaurant_id: v })}>
            <SelectTrigger><SelectValue placeholder="Select restaurant" /></SelectTrigger>
            <SelectContent>{restaurants.map((r: any) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Vault / user name</Label><Input value={form.vault_user_name} onChange={(e) => setForm({ ...form, vault_user_name: e.target.value })} placeholder="e.g. Manager A Cash" /></div>
        <div><Label>Opening balance</Label><Input type="number" step="0.01" value={form.opening_balance} onChange={(e) => setForm({ ...form, opening_balance: e.target.value })} disabled={!!form.id} /></div>
        <div className="flex items-center gap-2"><Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} /><Label>Active</Label></div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={() => setForm(null)}>Cancel</Button>
        <Button onClick={() => onSave(form)} disabled={saving || !form.vault_user_name.trim() || !form.restaurant_id}>{saving ? "Saving…" : "Save"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}
