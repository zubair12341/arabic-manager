import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { restaurantsQuery, vaultsQuery, expensesQuery, type Expense } from "@/lib/queries";
import { settingsQuery } from "@/lib/settings";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, TableSkeleton, EmptyState, StatCard } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, Download } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { fmtMoney, fmtDate } from "@/lib/format";
import { newDoc, docHeader, table, save, pdfMoney, pdfDate, summaryRows } from "@/lib/pdf";

export const Route = createFileRoute("/_authenticated/expenses")({
  head: () => ({
    meta: [
      { title: "Expenses & Overheads — Vendor & Cash Manager" },
      { name: "description", content: "Record restaurant expenses and overheads paid from a cash-in-hand vault." },
      { property: "og:title", content: "Expenses & Overheads" },
      { property: "og:description", content: "Record restaurant expenses and overheads paid from a cash-in-hand vault." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ExpensesPage,
});

export const EXPENSE_TYPES = [
  "Salary / Wages", "Rent", "Electricity Bill", "Gas Bill", "Water Bill", "Internet / Phone",
  "Repair & Maintenance", "Transport / Fuel", "Packaging", "Cleaning & Supplies",
  "Marketing", "Government / Taxes", "Miscellaneous",
];

type Form = { id?: string; restaurant_id: string; vault_id: string; expense_type: string; amount: string; note: string; expense_date: string };
const toLocalInput = (iso?: string) => {
  const d = iso ? new Date(iso) : new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const empty = (rid = ""): Form => ({ restaurant_id: rid, vault_id: "", expense_type: "", amount: "", note: "", expense_date: toLocalInput() });

function ExpensesPage() {
  const qc = useQueryClient();
  const restaurants = useQuery(restaurantsQuery());
  const vaults = useQuery(vaultsQuery());
  const expenses = useQuery(expensesQuery());
  const settings = useQuery(settingsQuery());
  const sym = settings.data?.currency_symbol ?? "$";

  const [form, setForm] = useState<Form | null>(null);
  const [delTarget, setDelTarget] = useState<Expense | null>(null);
  const [restFilter, setRestFilter] = useState("all");
  const [vaultFilter, setVaultFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const restName = (id: string) => restaurants.data?.find(r => r.id === id)?.name ?? "—";
  const vaultName = (id: string) => vaults.data?.find(v => v.id === id)?.vault_user_name ?? "—";

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["expenses"] });
    qc.invalidateQueries({ queryKey: ["vaults"] });
  };

  const saveExpense = useMutation({
    mutationFn: async (f: Form) => {
      const payload = {
        restaurant_id: f.restaurant_id, vault_id: f.vault_id,
        expense_type: f.expense_type.trim(), amount: Number(f.amount || 0),
        note: f.note.trim() || null, expense_date: new Date(f.expense_date).toISOString(),
      };
      if (f.id) { const { error } = await supabase.from("expenses").update(payload).eq("id", f.id); if (error) throw error; }
      else { const { error } = await supabase.from("expenses").insert(payload); if (error) throw error; }
    },
    onSuccess: () => { invalidate(); setForm(null); toast.success("Expense saved"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (e: Expense) => { const { error } = await supabase.from("expenses").delete().eq("id", e.id); if (error) throw error; },
    onSuccess: () => { invalidate(); setDelTarget(null); toast.success("Expense deleted"); },
    onError: (e: Error) => { toast.error(e.message); setDelTarget(null); },
  });

  const rows = useMemo(() => (expenses.data ?? []).filter(e =>
    (restFilter === "all" || e.restaurant_id === restFilter) &&
    (vaultFilter === "all" || e.vault_id === vaultFilter) &&
    (typeFilter === "all" || e.expense_type === typeFilter) &&
    (!from || e.expense_date >= new Date(`${from}T00:00:00`).toISOString()) &&
    (!to || e.expense_date < new Date(new Date(`${to}T00:00:00`).getTime() + 86400000).toISOString())
  ), [expenses.data, restFilter, vaultFilter, typeFilter, from, to]);

  const total = rows.reduce((s, e) => s + Number(e.amount), 0);
  const types = useMemo(() => Array.from(new Set([...EXPENSE_TYPES, ...(expenses.data ?? []).map(e => e.expense_type)])), [expenses.data]);

  const selectedVault = vaults.data?.find(v => v.id === form?.vault_id);
  const overdraft = form && selectedVault && Number(form.amount || 0) > Number(selectedVault.current_balance);

  const exportPdf = () => {
    const doc = newDoc();
    let y = docHeader(doc, {
      business: settings.data?.business_name,
      title: "Expenses & Overheads Report",
      meta: [
        ["Restaurant", restFilter === "all" ? "All restaurants" : restName(restFilter)],
        ["Cash in hand user", vaultFilter === "all" ? "All users" : vaultName(vaultFilter)],
        ["Period", `${from || "Start"} to ${to || "Today"}`],
        ["Generated", pdfDate(new Date())],
      ],
    });
    y = table(doc, y,
      ["Date", "Restaurant", "Cash user", "Expense type", "Note", "Amount"],
      rows.map(e => [pdfDate(e.expense_date), restName(e.restaurant_id), vaultName(e.vault_id), e.expense_type, e.note ?? "—", pdfMoney(e.amount)]),
      [["", "", "", "", "TOTAL EXPENSES", pdfMoney(total)]],
      { align: { 5: "right" } });
    summaryRows(doc, y, [["TOTAL EXPENSES", pdfMoney(total), true]]);
    save(doc, "expenses-report");
  };

  return (
    <div>
      <PageHeader title="Expenses & Overheads" description="Record expenses paid out of a restaurant's cash in hand. Balances update automatically."
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={exportPdf} disabled={rows.length === 0}><Download className="h-4 w-4 mr-1" /> Download PDF</Button>
            <Button onClick={() => setForm(empty(restFilter === "all" ? "" : restFilter))} disabled={(vaults.data ?? []).length === 0}><Plus className="h-4 w-4 mr-1" /> New expense</Button>
          </div>
        } />

      <div className="flex flex-wrap gap-2 mb-4">
        <Select value={restFilter} onValueChange={(v) => { setRestFilter(v); setVaultFilter("all"); }}>
          <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All restaurants</SelectItem>
            {(restaurants.data ?? []).map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={vaultFilter} onValueChange={setVaultFilter}>
          <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All cash users</SelectItem>
            {(vaults.data ?? []).filter(v => restFilter === "all" || v.restaurant_id === restFilter).map(v => <SelectItem key={v.id} value={v.id}>{v.vault_user_name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All expense types</SelectItem>
            {types.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="date" className="w-[160px]" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input type="date" className="w-[160px]" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>

      <div className="grid gap-2 md:grid-cols-3 mb-4">
        <StatCard label="Total expenses (filtered)" value={fmtMoney(total, sym)} />
        <StatCard label="Entries" value={rows.length} />
      </div>

      {expenses.isLoading ? <TableSkeleton /> : rows.length === 0 ? (
        <EmptyState title="No expenses" description="Record your first expense or overhead." />
      ) : (
        <div className="border rounded-lg bg-card overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Date</TableHead><TableHead>Restaurant</TableHead><TableHead>Cash user</TableHead>
              <TableHead>Expense type</TableHead><TableHead>Note</TableHead>
              <TableHead className="text-right">Amount</TableHead><TableHead className="w-[90px]"></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.map(e => (
                <TableRow key={e.id}>
                  <TableCell>{fmtDate(e.expense_date)}</TableCell>
                  <TableCell>{restName(e.restaurant_id)}</TableCell>
                  <TableCell>{vaultName(e.vault_id)}</TableCell>
                  <TableCell className="font-medium">{e.expense_type}</TableCell>
                  <TableCell className="text-muted-foreground">{e.note ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{fmtMoney(e.amount, sym)}</TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-end">
                      <Button size="icon" variant="ghost" onClick={() => setForm({ id: e.id, restaurant_id: e.restaurant_id, vault_id: e.vault_id, expense_type: e.expense_type, amount: String(e.amount), note: e.note ?? "", expense_date: toLocalInput(e.expense_date) })}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => setDelTarget(e)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/40 font-semibold">
                <TableCell colSpan={5}>Total</TableCell>
                <TableCell className="text-right tabular-nums">{fmtMoney(total, sym)}</TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={form !== null} onOpenChange={(o) => !o && setForm(null)}>
        {form && (
          <DialogContent>
            <DialogHeader><DialogTitle>{form.id ? "Edit expense" : "New expense / overhead"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Restaurant</Label>
                <Select value={form.restaurant_id} onValueChange={(v) => setForm({ ...form, restaurant_id: v, vault_id: "" })}>
                  <SelectTrigger><SelectValue placeholder="Select restaurant" /></SelectTrigger>
                  <SelectContent>{(restaurants.data ?? []).map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Expense type</Label>
                <Input list="expense-types" value={form.expense_type} onChange={(e) => setForm({ ...form, expense_type: e.target.value })} placeholder="e.g. Electricity Bill" />
                <datalist id="expense-types">{types.map(t => <option key={t} value={t} />)}</datalist>
              </div>
              <div><Label>Amount</Label><Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" /></div>
              <div><Label>Cash in hand user (vault)</Label>
                <Select value={form.vault_id} onValueChange={(v) => setForm({ ...form, vault_id: v })} disabled={!form.restaurant_id}>
                  <SelectTrigger><SelectValue placeholder="Select vault user" /></SelectTrigger>
                  <SelectContent>
                    {(vaults.data ?? []).filter(v => v.restaurant_id === form.restaurant_id).map(v => (
                      <SelectItem key={v.id} value={v.id}>{v.vault_user_name} — {fmtMoney(v.current_balance, sym)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Date</Label><Input type="datetime-local" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} /></div>
              <div><Label>Note</Label><Textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Optional details" /></div>
              {overdraft && <p className="text-sm text-destructive">Warning: this exceeds the vault's current cash ({fmtMoney(selectedVault?.current_balance ?? 0, sym)}). It will go negative.</p>}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setForm(null)}>Cancel</Button>
              <Button onClick={() => saveExpense.mutate(form)} disabled={saveExpense.isPending || !form.restaurant_id || !form.vault_id || !form.expense_type.trim() || !Number(form.amount)}>{saveExpense.isPending ? "Saving…" : "Save"}</Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      <AlertDialog open={delTarget !== null} onOpenChange={(o) => !o && setDelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete expense?</AlertDialogTitle>
            <AlertDialogDescription>The amount will be added back to the vault's cash balance.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => delTarget && del.mutate(delTarget)}>Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
