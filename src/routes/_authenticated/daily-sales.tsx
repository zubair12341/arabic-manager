import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  restaurantsQuery, vaultsQuery, vendorsQuery, purchasesQuery, paymentsQuery,
  vaultDepositsQuery, expensesQuery, dailySalesQuery, type DailySale, type Expense,
} from "@/lib/queries";
import { settingsQuery } from "@/lib/settings";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, StatCard, EmptyState } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, Lock, Unlock, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { fmtMoney, fmtDate } from "@/lib/format";
import { buildTxns, cashPeriod, dayStart, dayEnd } from "@/lib/report-data";

export const Route = createFileRoute("/_authenticated/daily-sales")({
  head: () => ({
    meta: [
      { title: "Daily Sale & Cash Flow — Vendor & Cash Manager" },
      { name: "description", content: "Record each day's sale, counter cash, cash allocations, daily expenses and closing cash count." },
      { property: "og:title", content: "Daily Sale & Cash Flow" },
      { property: "og:description", content: "Record each day's sale, counter cash, cash allocations, daily expenses and closing cash count." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DailySalesPage,
});

export const DISCLAIMER =
  "This is not true Gross Profit or Net Profit. The application has no inventory, opening/closing stock, recipe, or ingredient-consumption tracking, so real Cost of Goods Sold cannot be calculated — this figure only reflects purchases recorded against vendors on this date, which is not the same as the cost of what was actually sold.";

export const DAILY_EXPENSE_CATEGORIES = [
  { value: "labour", label: "Labour wages" },
  { value: "counter_purchase", label: "Counter purchase" },
  { value: "general", label: "General expense" },
] as const;

const today = () => new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const num = (v: string) => Number(v || 0);

type SaleForm = {
  counter_vault_id: string;
  total_sale: string; cash_sale: string; udhaar_sale: string; online_sale: string;
  pending_online_recv: string; discount: string; other_income: string; notes: string;
};

type ExpForm = { id?: string; vault_id: string; category: string; expense_type: string; amount: string; note: string };

const toForm = (d: DailySale): SaleForm => ({
  counter_vault_id: d.counter_vault_id ?? "",
  total_sale: String(d.total_sale ?? 0), cash_sale: String(d.cash_sale ?? 0),
  udhaar_sale: String(d.udhaar_sale ?? 0), online_sale: String(d.online_sale ?? 0),
  pending_online_recv: String(d.pending_online_recv ?? 0), discount: String(d.discount ?? 0),
  other_income: String(d.other_income ?? 0), notes: d.notes ?? "",
});

function DailySalesPage() {
  const qc = useQueryClient();
  const restaurants = useQuery(restaurantsQuery());
  const vaults = useQuery(vaultsQuery());
  const vendors = useQuery(vendorsQuery());
  const purchases = useQuery(purchasesQuery());
  const payments = useQuery(paymentsQuery());
  const deposits = useQuery(vaultDepositsQuery());
  const expenses = useQuery(expensesQuery());
  const settings = useQuery(settingsQuery());
  const sym = settings.data?.currency_symbol ?? "$";

  const [restId, setRestId] = useState("");
  const [date, setDate] = useState(today());
  const sales = useQuery({ ...dailySalesQuery(restId || null), enabled: !!restId });

  const day = useMemo(
    () => (sales.data ?? []).find(d => d.sale_date === date) ?? null,
    [sales.data, date],
  );

  const [form, setForm] = useState<SaleForm | null>(null);
  const [transfers, setTransfers] = useState<Record<string, string>>({});
  const [actual, setActual] = useState("");
  const [expForm, setExpForm] = useState<ExpForm | null>(null);
  const [delExp, setDelExp] = useState<Expense | null>(null);

  useEffect(() => {
    if (restaurants.data?.length && !restId) setRestId(restaurants.data[0].id);
  }, [restaurants.data, restId]);

  const restVaults = useMemo(
    () => (vaults.data ?? []).filter(v => v.restaurant_id === restId && v.is_active),
    [vaults.data, restId],
  );
  const vaultName = (id: string | null) => vaults.data?.find(v => v.id === id)?.vault_user_name ?? "—";

  const dayDeposits = useMemo(
    () => (deposits.data ?? []).filter(d => d.daily_sale_id === day?.id),
    [deposits.data, day?.id],
  );
  const dayExpenses = useMemo(
    () => (expenses.data ?? []).filter(e => e.daily_sale_id === day?.id),
    [expenses.data, day?.id],
  );

  // Sync local editors when the loaded day changes.
  useEffect(() => {
    if (!day) { setForm(null); setTransfers({}); setActual(""); return; }
    setForm(toForm(day));
    setActual(day.actual_cash_counted === null ? "" : String(day.actual_cash_counted));
  }, [day?.id, day?.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const d of dayDeposits) {
      if (d.kind === "transfer_in") next[d.vault_id] = String(Number(d.amount));
    }
    setTransfers(next);
  }, [dayDeposits]);

  const locked = !!day?.is_closed;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["daily_sales"] });
    qc.invalidateQueries({ queryKey: ["vault_deposits"] });
    qc.invalidateQueries({ queryKey: ["expenses"] });
    qc.invalidateQueries({ queryKey: ["vaults"] });
  };

  const createDay = useMutation({
    mutationFn: async () => {
      const counter = restVaults.find(v => /counter/i.test(v.vault_user_name)) ?? restVaults[0];
      const { error } = await supabase.from("daily_sales").insert({
        restaurant_id: restId, sale_date: date, counter_vault_id: counter?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success("Day created"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveSale = useMutation({
    mutationFn: async (f: SaleForm) => {
      if (!day) throw new Error("No day loaded");
      const { error } = await supabase.from("daily_sales").update({
        counter_vault_id: f.counter_vault_id || null,
        total_sale: num(f.total_sale), cash_sale: num(f.cash_sale), udhaar_sale: num(f.udhaar_sale),
        online_sale: num(f.online_sale), pending_online_recv: num(f.pending_online_recv),
        discount: num(f.discount), other_income: num(f.other_income),
        notes: f.notes.trim() || null,
      }).eq("id", day.id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success("Day's sale saved — counter cash updated"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveTransfer = useMutation({
    mutationFn: async ({ vaultId, amount }: { vaultId: string; amount: number }) => {
      if (!day) throw new Error("No day loaded");
      const { error } = await supabase.rpc("set_daily_cash_transfer", {
        p_daily_sale_id: day.id, p_to_vault_id: vaultId, p_amount: amount,
      });
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success("Cash transfer updated"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveExpense = useMutation({
    mutationFn: async (f: ExpForm) => {
      if (!day) throw new Error("No day loaded");
      const payload = {
        restaurant_id: restId, vault_id: f.vault_id, category: f.category,
        expense_type: f.expense_type.trim(), amount: num(f.amount),
        note: f.note.trim() || null,
        expense_date: new Date(`${date}T12:00:00`).toISOString(),
        daily_sale_id: day.id,
      };
      if (f.id) { const { error } = await supabase.from("expenses").update(payload).eq("id", f.id); if (error) throw error; }
      else { const { error } = await supabase.from("expenses").insert(payload); if (error) throw error; }
    },
    onSuccess: () => { invalidate(); setExpForm(null); toast.success("Expense saved"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteExpense = useMutation({
    mutationFn: async (e: Expense) => { const { error } = await supabase.from("expenses").delete().eq("id", e.id); if (error) throw error; },
    onSuccess: () => { invalidate(); setDelExp(null); toast.success("Expense deleted"); },
    onError: (e: Error) => { toast.error(e.message); setDelExp(null); },
  });

  const saveClosing = useMutation({
    mutationFn: async (v: { actual: string; close?: boolean; reopen?: boolean }) => {
      if (!day) throw new Error("No day loaded");
      const { data: auth } = await supabase.auth.getUser();
      const patch: Record<string, unknown> = {
        actual_cash_counted: v.actual === "" ? null : Number(v.actual),
      };
      if (v.close) { patch.is_closed = true; patch.closed_at = new Date().toISOString(); patch.closed_by = auth.user?.id ?? null; }
      if (v.reopen) { patch.is_closed = false; patch.closed_at = null; patch.closed_by = null; }
      const { error } = await supabase.from("daily_sales").update(patch).eq("id", day.id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success("Closing saved"); },
    onError: (e: Error) => toast.error(e.message),
  });

  // ---- derived figures -------------------------------------------------
  const txns = useMemo(() => buildTxns({
    purchases: purchases.data ?? [], payments: payments.data ?? [],
    deposits: deposits.data ?? [], expenses: expenses.data ?? [], vendors: vendors.data ?? [],
  }), [purchases.data, payments.data, deposits.data, expenses.data, vendors.data]);

  // Expected cash for the whole restaurant, from the beginning through end of this day.
  const upToToday = useMemo(() => cashPeriod({
    txns, vaults: vaults.data ?? [], restaurantId: restId, vaultId: null,
    from: null, to: dayEnd(date),
  }), [txns, vaults.data, restId, date]);

  const todayPeriod = useMemo(() => cashPeriod({
    txns, vaults: vaults.data ?? [], restaurantId: restId, vaultId: null,
    from: dayStart(date), to: dayEnd(date),
  }), [txns, vaults.data, restId, date]);

  const expected = upToToday.closing;
  const variance = actual === "" ? null : Number(actual) - expected;

  const reconTarget = form
    ? num(form.cash_sale) + num(form.udhaar_sale) + num(form.online_sale) + num(form.other_income) - num(form.discount)
    : 0;
  const reconOff = form ? Math.abs(reconTarget - num(form.total_sale)) > 0.005 : false;

  const dayPurchases = useMemo(() => (purchases.data ?? []).filter(p =>
    p.restaurant_id === restId && p.purchase_date >= dayStart(date) && p.purchase_date < dayEnd(date)
  ), [purchases.data, restId, date]);
  const purchaseTotal = dayPurchases.reduce((s, p) => s + Number(p.amount), 0);

  const dayPayments = useMemo(() => (payments.data ?? []).filter(p =>
    p.restaurant_id === restId && p.payment_date >= dayStart(date) && p.payment_date < dayEnd(date)
  ), [payments.data, restId, date]);

  const labourRows = dayExpenses.filter(e => e.category === "labour");
  const otherRows = dayExpenses.filter(e => e.category !== "labour");
  const labourTotal = labourRows.reduce((s, e) => s + Number(e.amount), 0);
  const otherTotal = otherRows.reduce((s, e) => s + Number(e.amount), 0);

  const operatingResult = day
    ? Number(day.total_sale) - Number(day.discount) - purchaseTotal - labourTotal - otherTotal
    : 0;

  const counterDeposit = dayDeposits.find(d => d.kind === "cash_sale");
  const transferVaults = restVaults.filter(v => v.id !== day?.counter_vault_id);
  const vendorName = (id: string) => vendors.data?.find(v => v.id === id)?.name ?? "—";

  const numField = (label: string, key: keyof SaleForm) => (
    <div>
      <Label>{label}</Label>
      <Input type="number" step="0.01" disabled={locked} value={form?.[key] ?? ""}
        onChange={(e) => form && setForm({ ...form, [key]: e.target.value })} />
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Daily Sale & Cash Flow"
        description="Record the day's sale, move counter cash to your cash-in-hand users, log daily expenses and close the day."
        action={day && (
          <Badge variant={locked ? "destructive" : "secondary"} className="h-8 px-3">
            {locked ? <><Lock className="h-3 w-3 mr-1" /> Day closed</> : "Open"}
          </Badge>
        )}
      />

      <div className="flex flex-wrap gap-2 mb-5">
        <Select value={restId} onValueChange={setRestId}>
          <SelectTrigger className="w-[220px]"><SelectValue placeholder="Select restaurant" /></SelectTrigger>
          <SelectContent>{(restaurants.data ?? []).map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
        </Select>
        <Input type="date" className="w-[170px]" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      {!restId ? (
        <EmptyState title="Select a restaurant" description="Choose a restaurant to record its daily sale." />
      ) : !day ? (
        <EmptyState
          title={`No sale recorded for ${fmtDate(date)}`}
          description="Create the day's record to start entering sale figures and cash movements."
          action={<Button onClick={() => createDay.mutate()} disabled={createDay.isPending || restVaults.length === 0}>
            <Plus className="h-4 w-4 mr-1" /> Create day
          </Button>}
        />
      ) : (
        <div className="space-y-6">
          {/* -------- Today's sale -------- */}
          <Card className="p-5">
            <h2 className="font-semibold mb-3">Today's sale</h2>
            <div className="grid gap-3 md:grid-cols-4">
              {numField("Total sale", "total_sale")}
              {numField("Cash sale", "cash_sale")}
              {numField("Udhaar (credit) sale", "udhaar_sale")}
              {numField("Online sale", "online_sale")}
              {numField("Pending online receivable", "pending_online_recv")}
              {numField("Discount", "discount")}
              {numField("Other income (milk, chicken, side items)", "other_income")}
              <div>
                <Label>Counter cash user</Label>
                <Select value={form?.counter_vault_id ?? ""} disabled={locked}
                  onValueChange={(v) => form && setForm({ ...form, counter_vault_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select counter vault" /></SelectTrigger>
                  <SelectContent>{restVaults.map(v => <SelectItem key={v.id} value={v.id}>{v.vault_user_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="mt-3">
              <Label>Notes</Label>
              <Textarea disabled={locked} value={form?.notes ?? ""} onChange={(e) => form && setForm({ ...form, notes: e.target.value })} />
            </div>
            {reconOff && (
              <p className="text-sm text-amber-600 dark:text-amber-500 mt-3">
                Check: Cash + Udhaar + Online + Other income − Discount = {fmtMoney(reconTarget, sym)}, but Total sale is {fmtMoney(num(form?.total_sale ?? "0"), sym)}.
                Difference {fmtMoney(reconTarget - num(form?.total_sale ?? "0"), sym)}. You can still save.
              </p>
            )}
            <div className="flex items-center gap-3 mt-4">
              <Button onClick={() => form && saveSale.mutate(form)} disabled={locked || saveSale.isPending}>
                <Save className="h-4 w-4 mr-1" /> {saveSale.isPending ? "Saving…" : "Save sale"}
              </Button>
              <span className="text-sm text-muted-foreground">
                Counter cash recorded for this day: <strong className="tabular-nums">{fmtMoney(counterDeposit?.amount ?? 0, sym)}</strong>
                {counterDeposit && ` into ${vaultName(counterDeposit.vault_id)}`} (single entry — editing updates it, never adds a second).
              </span>
            </div>
          </Card>

          {/* -------- Cash allocation -------- */}
          <Card className="p-5">
            <h2 className="font-semibold">Cash allocation / transfers from counter</h2>
            <p className="text-sm text-muted-foreground mb-3">
              Moves cash from {vaultName(day.counter_vault_id)} to another cash-in-hand user. This only relocates existing cash —
              total cash across all users never changes.
            </p>
            {transferVaults.length === 0 ? (
              <p className="text-sm text-muted-foreground">No other active cash-in-hand users for this restaurant.</p>
            ) : (
              <div className="space-y-2">
                {transferVaults.map(v => (
                  <div key={v.id} className="flex flex-wrap items-end gap-3">
                    <div className="min-w-[180px]">
                      <Label>{v.vault_user_name}</Label>
                      <div className="text-xs text-muted-foreground">Current cash {fmtMoney(v.current_balance, sym)}</div>
                    </div>
                    <Input type="number" step="0.01" className="w-[160px]" disabled={locked}
                      value={transfers[v.id] ?? ""} placeholder="0.00"
                      onChange={(e) => setTransfers({ ...transfers, [v.id]: e.target.value })} />
                    <Button variant="outline" disabled={locked || saveTransfer.isPending}
                      onClick={() => saveTransfer.mutate({ vaultId: v.id, amount: num(transfers[v.id] ?? "0") })}>
                      Save transfer
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* -------- Today's expenses -------- */}
          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">Today's expenses</h2>
              <Button size="sm" disabled={locked}
                onClick={() => setExpForm({ vault_id: day.counter_vault_id ?? "", category: "labour", expense_type: "", amount: "", note: "" })}>
                <Plus className="h-4 w-4 mr-1" /> Add expense
              </Button>
            </div>
            {[{ title: "Labour wages", rows: labourRows, total: labourTotal },
              { title: "Other daily expenses", rows: otherRows, total: otherTotal }].map(sec => (
              <div key={sec.title} className="mb-4">
                <div className="text-sm font-medium mb-1">{sec.title}</div>
                <div className="border rounded-lg overflow-x-auto">
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Name / payee</TableHead><TableHead>Category</TableHead><TableHead>Paid from</TableHead>
                      <TableHead>Note</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="w-[90px]" />
                    </TableRow></TableHeader>
                    <TableBody>
                      {sec.rows.length === 0 ? (
                        <TableRow><TableCell colSpan={6} className="text-sm text-muted-foreground">No entries</TableCell></TableRow>
                      ) : sec.rows.map(e => (
                        <TableRow key={e.id}>
                          <TableCell className="font-medium">{e.expense_type}</TableCell>
                          <TableCell>{DAILY_EXPENSE_CATEGORIES.find(c => c.value === e.category)?.label ?? e.category ?? "—"}</TableCell>
                          <TableCell>{vaultName(e.vault_id)}</TableCell>
                          <TableCell className="text-muted-foreground">{e.note ?? "—"}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtMoney(e.amount, sym)}</TableCell>
                          <TableCell>
                            <div className="flex gap-1 justify-end">
                              <Button size="icon" variant="ghost" disabled={locked}
                                onClick={() => setExpForm({ id: e.id, vault_id: e.vault_id, category: e.category ?? "general", expense_type: e.expense_type, amount: String(e.amount), note: e.note ?? "" })}>
                                <Pencil className="h-4 w-4" /></Button>
                              <Button size="icon" variant="ghost" disabled={locked} onClick={() => setDelExp(e)}><Trash2 className="h-4 w-4" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/40 font-semibold">
                        <TableCell colSpan={4}>Total</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtMoney(sec.total, sym)}</TableCell>
                        <TableCell />
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </div>
            ))}
          </Card>

          {/* -------- Vendor payments today -------- */}
          <Card className="p-5">
            <h2 className="font-semibold">Vendor payments today</h2>
            <p className="text-sm text-muted-foreground mb-3">
              Read-only, from the Payments module. A vendor payment settles an existing payable — it is never an expense.
            </p>
            <div className="border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Vendor</TableHead><TableHead>Paid from</TableHead><TableHead>Note</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {dayPayments.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-sm text-muted-foreground">No vendor payments on this date</TableCell></TableRow>
                  ) : dayPayments.map(p => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{vendorName(p.vendor_id)}</TableCell>
                      <TableCell>{vaultName(p.vault_id)}</TableCell>
                      <TableCell className="text-muted-foreground">{p.note ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtMoney(p.amount, sym)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>

          {/* -------- Closing -------- */}
          <Card className="p-5">
            <h2 className="font-semibold mb-3">Closing</h2>
            <div className="grid gap-2 md:grid-cols-4 mb-4">
              <StatCard label="Cash received today" value={fmtMoney(todayPeriod.received, sym)} hint="Includes the day's cash sale" />
              <StatCard label="Paid to vendors today" value={fmtMoney(todayPeriod.paidVendors, sym)} />
              <StatCard label="Expenses today" value={fmtMoney(todayPeriod.expenses, sym)} />
              <StatCard label="Expected cash in hand" value={fmtMoney(expected, sym)} hint="All cash users, up to end of this day" />
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <Label>Actual cash counted</Label>
                <Input type="number" step="0.01" className="w-[180px]" disabled={locked}
                  value={actual} onChange={(e) => setActual(e.target.value)} />
              </div>
              <div className="min-w-[180px]">
                <Label>Short / extra (variance)</Label>
                <div className={`text-xl font-semibold tabular-nums ${variance === null ? "text-muted-foreground" : variance < 0 ? "text-destructive" : "text-emerald-600"}`}>
                  {variance === null ? "—" : `${variance > 0 ? "Extra " : variance < 0 ? "Short " : ""}${fmtMoney(variance, sym)}`}
                </div>
              </div>
              <Button variant="outline" disabled={locked || saveClosing.isPending} onClick={() => saveClosing.mutate({ actual })}>
                Save count
              </Button>
              {locked ? (
                <Button variant="secondary" onClick={() => saveClosing.mutate({ actual, reopen: true })}>
                  <Unlock className="h-4 w-4 mr-1" /> Reopen day
                </Button>
              ) : (
                <Button onClick={() => saveClosing.mutate({ actual, close: true })} disabled={saveClosing.isPending}>
                  <Lock className="h-4 w-4 mr-1" /> Close day
                </Button>
              )}
            </div>
            {day.closed_at && <p className="text-xs text-muted-foreground mt-2">Closed on {fmtDate(day.closed_at)}</p>}
          </Card>

          {/* -------- Operating result -------- */}
          <Card className="p-5">
            <h2 className="font-semibold">Estimated Operating Result (Purchase-Based)</h2>
            <div className="text-3xl font-semibold tabular-nums mt-2">{fmtMoney(operatingResult, sym)}</div>
            <Separator className="my-3" />
            <div className="grid gap-2 md:grid-cols-5 text-sm">
              <div><div className="text-muted-foreground">Total sale</div><div className="tabular-nums">{fmtMoney(day.total_sale, sym)}</div></div>
              <div><div className="text-muted-foreground">Discount</div><div className="tabular-nums">−{fmtMoney(day.discount, sym)}</div></div>
              <div><div className="text-muted-foreground">Vendor purchases this date</div><div className="tabular-nums">−{fmtMoney(purchaseTotal, sym)}</div></div>
              <div><div className="text-muted-foreground">Labour</div><div className="tabular-nums">−{fmtMoney(labourTotal, sym)}</div></div>
              <div><div className="text-muted-foreground">Other expenses</div><div className="tabular-nums">−{fmtMoney(otherTotal, sym)}</div></div>
            </div>
            <p className="text-xs text-muted-foreground mt-3">{DISCLAIMER}</p>
          </Card>
        </div>
      )}

      {/* expense dialog */}
      <Dialog open={expForm !== null} onOpenChange={(o) => !o && setExpForm(null)}>
        {expForm && (
          <DialogContent>
            <DialogHeader><DialogTitle>{expForm.id ? "Edit daily expense" : "New daily expense"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Category</Label>
                <Select value={expForm.category} onValueChange={(v) => setExpForm({ ...expForm, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{DAILY_EXPENSE_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Name / payee / description</Label>
                <Input value={expForm.expense_type} onChange={(e) => setExpForm({ ...expForm, expense_type: e.target.value })} placeholder="e.g. Imran wages" /></div>
              <div><Label>Amount</Label>
                <Input type="number" step="0.01" value={expForm.amount} onChange={(e) => setExpForm({ ...expForm, amount: e.target.value })} /></div>
              <div><Label>Pay from (cash in hand user)</Label>
                <Select value={expForm.vault_id} onValueChange={(v) => setExpForm({ ...expForm, vault_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select cash user" /></SelectTrigger>
                  <SelectContent>{restVaults.map(v => <SelectItem key={v.id} value={v.id}>{v.vault_user_name} — {fmtMoney(v.current_balance, sym)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Note</Label><Input value={expForm.note} onChange={(e) => setExpForm({ ...expForm, note: e.target.value })} /></div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setExpForm(null)}>Cancel</Button>
              <Button onClick={() => saveExpense.mutate(expForm)}
                disabled={saveExpense.isPending || !expForm.vault_id || !expForm.expense_type.trim() || !num(expForm.amount)}>
                {saveExpense.isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      <AlertDialog open={delExp !== null} onOpenChange={(o) => !o && setDelExp(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this expense?</AlertDialogTitle>
            <AlertDialogDescription>The amount will be added back to the cash user's balance.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => delExp && deleteExpense.mutate(delExp)}>Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
