import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { restaurantsQuery, vaultsQuery, vendorsQuery, purchasesQuery, paymentsQuery, vaultDepositsQuery, expensesQuery } from "@/lib/queries";
import { settingsQuery } from "@/lib/settings";
import { PageHeader, EmptyState, StatCard } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download } from "lucide-react";
import { useMemo, useState } from "react";
import { fmtMoney, fmtDate } from "@/lib/format";
import { buildTxns, cashPeriod, vendorReport, dayStart, dayEnd } from "@/lib/report-data";
import { newDoc, docHeader, table, summaryRows, sectionTitle, save, pdfMoney, pdfDate, pdfDateTime, dayName } from "@/lib/pdf";

export const Route = createFileRoute("/_authenticated/report")({
  head: () => ({
    meta: [
      { title: "Reports — Vendor & Cash Manager" },
      { name: "description", content: "Daily, overall, vendor, cash-in-hand and expense reports with one-click PDF download." },
      { property: "og:title", content: "Reports — Vendor & Cash Manager" },
      { property: "og:description", content: "Daily, overall, vendor, cash-in-hand and expense reports with one-click PDF download." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReportPage,
});

const today = () => new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

function ReportPage() {
  const restaurants = useQuery(restaurantsQuery());
  const vaults = useQuery(vaultsQuery());
  const vendors = useQuery(vendorsQuery());
  const purchases = useQuery(purchasesQuery());
  const payments = useQuery(paymentsQuery());
  const deposits = useQuery(vaultDepositsQuery());
  const expenses = useQuery(expensesQuery());
  const settings = useQuery(settingsQuery());
  const sym = settings.data?.currency_symbol ?? "$";
  const business = settings.data?.business_name ?? "";

  const [restId, setRestId] = useState("");
  const [vaultId, setVaultId] = useState("all");
  const [date, setDate] = useState(today());
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const restaurant = restaurants.data?.find(r => r.id === restId);
  const restName = restaurant?.name ?? "";
  const vaultLabel = vaultId === "all" ? "All cash users" : (vaults.data?.find(v => v.id === vaultId)?.vault_user_name ?? "");
  const restVaults = (vaults.data ?? []).filter(v => v.restaurant_id === restId);

  const txns = useMemo(() => buildTxns({
    purchases: purchases.data ?? [], payments: payments.data ?? [],
    deposits: deposits.data ?? [], expenses: expenses.data ?? [], vendors: vendors.data ?? [],
  }), [purchases.data, payments.data, deposits.data, expenses.data, vendors.data]);

  const scopedVaultId = vaultId === "all" ? null : vaultId;

  const daily = useMemo(() => cashPeriod({
    txns, vaults: vaults.data ?? [], restaurantId: restId, vaultId: scopedVaultId,
    from: dayStart(date), to: dayEnd(date),
  }), [txns, vaults.data, restId, scopedVaultId, date]);

  const overall = useMemo(() => cashPeriod({
    txns, vaults: vaults.data ?? [], restaurantId: restId, vaultId: scopedVaultId,
    from: from ? dayStart(from) : null, to: to ? dayEnd(to) : null,
  }), [txns, vaults.data, restId, scopedVaultId, from, to]);

  const vendorRows = useMemo(() => vendorReport({
    vendors: vendors.data ?? [], purchases: purchases.data ?? [], payments: payments.data ?? [],
    restaurantId: restId,
    from: from ? dayStart(from) : null, to: to ? dayEnd(to) : null,
    todayFrom: dayStart(date), todayTo: dayEnd(date),
  }), [vendors.data, purchases.data, payments.data, restId, from, to, date]);

  const vTotals = vendorRows.reduce((a, r) => ({
    old: a.old + r.old_balance, cur: a.cur + r.current_purchases, total: a.total + r.total,
    paid: a.paid + r.paid, today: a.today + r.paid_today, rem: a.rem + r.remaining,
  }), { old: 0, cur: 0, total: 0, paid: 0, today: 0, rem: 0 });

  const cashRows = useMemo(() => {
    const list = txns.filter(t => t.restaurant_id === restId && (!scopedVaultId || t.vault_id === scopedVaultId)
      && (!from || t.date >= dayStart(from)) && (!to || t.date < dayEnd(to)));
    const openingBase = (vaults.data ?? []).filter(v => v.restaurant_id === restId && (!scopedVaultId || v.id === scopedVaultId))
      .reduce((s, v) => s + Number(v.opening_balance), 0);
    const prior = txns.filter(t => t.restaurant_id === restId && (!scopedVaultId || t.vault_id === scopedVaultId) && from && t.date < dayStart(from))
      .reduce((s, t) => s + t.inflow - t.outflow, 0);
    let running = openingBase + prior;
    return list.map(t => { running += t.inflow - t.outflow; return { ...t, running }; });
  }, [txns, vaults.data, restId, scopedVaultId, from, to]);

  const expenseRows = useMemo(() => (expenses.data ?? []).filter(e => e.restaurant_id === restId
    && (!scopedVaultId || e.vault_id === scopedVaultId)
    && (!from || e.expense_date >= dayStart(from)) && (!to || e.expense_date < dayEnd(to))
  ), [expenses.data, restId, scopedVaultId, from, to]);

  const vaultName = (id: string) => vaults.data?.find(v => v.id === id)?.vault_user_name ?? "—";

  /* ------------------------------- PDF exports ------------------------------- */

  const cashHeaderMeta = (periodLabel: string): Array<[string, string]> => [
    ["Restaurant", restName],
    ["Cash in hand user", vaultLabel],
    ["Period", periodLabel],
    ["Generated", pdfDateTime(new Date())],
  ];

  const cashSheet = (p: ReturnType<typeof cashPeriod>, title: string, periodLabel: string) => {
    const doc = newDoc();
    let y = docHeader(doc, { business, title, meta: cashHeaderMeta(periodLabel) });
    y = summaryRows(doc, y, [
      ["OPENING CASH IN HAND", pdfMoney(p.opening)],
      ["CASH RECEIVED / ADDED", pdfMoney(p.received)],
    ]);

    y = sectionTitle(doc, y, "Payments to vendors (cash out)");
    y = table(doc, y,
      ["Date", "Paid to (vendor)", "Type", "Cash user", "Amount"],
      p.vendorRows.map(t => [pdfDate(t.date), t.party, t.kind, vaultName(t.vault_id), pdfMoney(t.outflow)]),
      [["", "", "", "TOTAL PAID", pdfMoney(p.paidVendors)]],
      { align: { 4: "right" } });

    y = sectionTitle(doc, y, "Expenses & overheads");
    y = table(doc, y,
      ["Date", "Expense type", "Note", "Cash user", "Amount"],
      p.expenseRows.map(t => [pdfDate(t.date), t.party, t.detail || "—", vaultName(t.vault_id), pdfMoney(t.outflow)]),
      [["", "", "", "TOTAL EXPENSES", pdfMoney(p.expenses)]],
      { align: { 4: "right" } });

    if (p.receivedRows.length) {
      y = sectionTitle(doc, y, "Cash received / added");
      y = table(doc, y,
        ["Date", "Cash user", "Note", "Amount"],
        p.receivedRows.map(t => [pdfDate(t.date), vaultName(t.vault_id), t.detail || "—", pdfMoney(t.inflow)]),
        [["", "", "TOTAL RECEIVED", pdfMoney(p.received)]],
        { align: { 3: "right" } });
    }

    summaryRows(doc, y, [
      ["TOTAL PAID + EXPENSES", pdfMoney(p.paidVendors + p.expenses)],
      ["CLOSING CASH IN HAND", pdfMoney(p.closing), true],
    ]);
    return doc;
  };

  const exportDaily = () => {
    const doc = cashSheet(daily, `${restName} — Daily Cash Report`, `${pdfDate(date)} (${dayName(date)})`);
    save(doc, `daily-${restName}-${date}`);
  };

  const exportOverall = () => {
    const label = `${from ? pdfDate(from) : "Start"} to ${to ? pdfDate(to) : "Today"}`;
    const doc = cashSheet(overall, `${restName} — Overall Cash Report`, label);
    save(doc, `overall-${restName}`);
  };

  const exportCashInHand = () => {
    const doc = newDoc();
    let y = docHeader(doc, {
      business, title: `${vaultLabel} — Cash in Hand`,
      meta: cashHeaderMeta(`${from ? pdfDate(from) : "Start"} to ${to ? pdfDate(to) : "Today"}`),
    });
    y = summaryRows(doc, y, [
      ["OPENING CASH IN HAND", pdfMoney(overall.opening)],
      ["CASH RECEIVED / ADDED (PERIOD)", pdfMoney(overall.received)],
      ["PAID TO VENDORS (PERIOD)", pdfMoney(overall.paidVendors)],
      ["EXPENSES & OVERHEADS (PERIOD)", pdfMoney(overall.expenses)],
      ["CURRENT / CLOSING CASH IN HAND", pdfMoney(overall.closing), true],
    ]);

    if (overall.receivedRows.length) {
      y = sectionTitle(doc, y, "Cash received / added");
      y = table(doc, y,
        ["Date", "Cash user", "Note", "Amount"],
        overall.receivedRows.map(t => [pdfDate(t.date), vaultName(t.vault_id), t.detail || "—", pdfMoney(t.inflow)]),
        [["", "", "TOTAL RECEIVED", pdfMoney(overall.received)]],
        { align: { 3: "right" } });
    }

    y = sectionTitle(doc, y, "Paid to vendors");
    y = table(doc, y,
      ["Date", "Paid to (vendor)", "Type", "Cash user", "Amount"],
      overall.vendorRows.map(t => [pdfDate(t.date), t.party, t.kind, vaultName(t.vault_id), pdfMoney(t.outflow)]),
      [["", "", "", "TOTAL PAID TO VENDORS", pdfMoney(overall.paidVendors)]],
      { align: { 4: "right" } });

    y = sectionTitle(doc, y, "Detailed transactions");
    y = table(doc, y,
      ["Date", "Restaurant", "Cash user", "Paid to / Source", "Type", "In", "Out", "Balance"],
      cashRows.map(t => [
        pdfDate(t.date), restName, vaultName(t.vault_id), t.party, t.kind,
        t.inflow ? pdfMoney(t.inflow) : "—", t.outflow ? pdfMoney(t.outflow) : "—", pdfMoney(t.running),
      ]),
      [["", "", "", "", "TOTALS", pdfMoney(overall.received), pdfMoney(overall.paidVendors + overall.expenses), pdfMoney(overall.closing)]],
      { align: { 5: "right", 6: "right", 7: "right" } });

    summaryRows(doc, y, [
      ["TOTAL RECEIVED", pdfMoney(overall.received)],
      ["TOTAL PAID TO VENDORS", pdfMoney(overall.paidVendors)],
      ["TOTAL PAID + EXPENSES", pdfMoney(overall.paidVendors + overall.expenses)],
      ["CASH IN HAND LEFT", pdfMoney(overall.closing), true],
      ["TOTAL REMAINING PAYABLE", pdfMoney(vTotals.rem), true],
    ]);
    save(doc, `cash-in-hand-${restName}`);

  };

  const exportVendor = () => {
    const doc = newDoc();
    let y = docHeader(doc, {
      business, title: `${restName} — Vendor Report`,
      meta: [
        ["Restaurant", restName],
        ["Period", `${from ? pdfDate(from) : "Start"} to ${to ? pdfDate(to) : "Today"}`],
        ["Paid Today date", `${pdfDate(date)} (${dayName(date)})`],
        ["Generated", pdfDateTime(new Date())],
      ],
    });
    y = table(doc, y,
      ["Vendor", "Old Balance", "Current Purchases", "Total", "Paid", "Paid Today", "Remaining Balance"],
      vendorRows.map(r => [r.name, pdfMoney(r.old_balance), pdfMoney(r.current_purchases), pdfMoney(r.total), pdfMoney(r.paid), pdfMoney(r.paid_today), pdfMoney(r.remaining)]),
      [["TOTAL", pdfMoney(vTotals.old), pdfMoney(vTotals.cur), pdfMoney(vTotals.total), pdfMoney(vTotals.paid), pdfMoney(vTotals.today), pdfMoney(vTotals.rem)]],
      { align: { 1: "right", 2: "right", 3: "right", 4: "right", 5: "right", 6: "right" } });
    summaryRows(doc, y, [
      ["CASH IN HAND — OPENING", pdfMoney(overall.opening)],
      ["CASH IN HAND — CURRENT", pdfMoney(overall.closing)],
      ["TOTAL REMAINING PAYABLE", pdfMoney(vTotals.rem), true],
    ]);
    save(doc, `vendor-report-${restName}`);
  };

  const exportExpenses = () => {
    const doc = newDoc();
    let y = docHeader(doc, {
      business, title: `${restName} — Expenses & Overheads`,
      meta: cashHeaderMeta(`${from ? pdfDate(from) : "Start"} to ${to ? pdfDate(to) : "Today"}`),
    });
    const totalExp = expenseRows.reduce((s, e) => s + Number(e.amount), 0);
    y = table(doc, y,
      ["Date", "Expense type", "Cash user", "Note", "Amount"],
      expenseRows.map(e => [pdfDate(e.expense_date), e.expense_type, vaultName(e.vault_id), e.note ?? "—", pdfMoney(e.amount)]),
      [["", "", "", "TOTAL", pdfMoney(totalExp)]],
      { align: { 4: "right" } });
    summaryRows(doc, y, [["TOTAL EXPENSES", pdfMoney(totalExp), true]]);
    save(doc, `expenses-${restName}`);
  };

  /* --------------------------------- render --------------------------------- */

  return (
    <div>
      <PageHeader title="Reports" description="Daily, overall, vendor, cash-in-hand and expense reports — all from live transaction data." />

      <div className="grid gap-3 md:grid-cols-5 mb-5">
        <div><Label className="text-xs">Restaurant</Label>
          <Select value={restId} onValueChange={(v) => { setRestId(v); setVaultId("all"); }}>
            <SelectTrigger><SelectValue placeholder="Select restaurant" /></SelectTrigger>
            <SelectContent>{(restaurants.data ?? []).map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label className="text-xs">Cash in hand user</Label>
          <Select value={vaultId} onValueChange={setVaultId} disabled={!restId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All cash users</SelectItem>
              {restVaults.map(v => <SelectItem key={v.id} value={v.id}>{v.vault_user_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div><Label className="text-xs">Daily date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div><Label className="text-xs">Period from</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><Label className="text-xs">Period to</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
      </div>

      {!restId ? <EmptyState title="Pick a restaurant" description="Choose a restaurant to generate reports." /> : (
        <Tabs defaultValue="daily">
          <TabsList className="mb-4 flex-wrap h-auto">
            <TabsTrigger value="daily">Daily</TabsTrigger>
            <TabsTrigger value="overall">Overall</TabsTrigger>
            <TabsTrigger value="vendor">Vendor Report</TabsTrigger>
            <TabsTrigger value="cash">Cash in Hand</TabsTrigger>
            <TabsTrigger value="expenses">Expenses</TabsTrigger>
          </TabsList>

          {/* DAILY */}
          <TabsContent value="daily">
            <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
              <div className="text-sm text-muted-foreground">{restName} · {fmtDate(date)} ({dayName(date)}) · {vaultLabel}</div>
              <Button onClick={exportDaily}><Download className="h-4 w-4 mr-1" /> Download Daily PDF</Button>
            </div>
            <CashView p={daily} sym={sym} vaultName={vaultName} />
          </TabsContent>

          {/* OVERALL */}
          <TabsContent value="overall">
            <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
              <div className="text-sm text-muted-foreground">{restName} · {from || "Start"} → {to || "Today"} · {vaultLabel}</div>
              <Button onClick={exportOverall}><Download className="h-4 w-4 mr-1" /> Download Overall PDF</Button>
            </div>
            <CashView p={overall} sym={sym} vaultName={vaultName} />
          </TabsContent>

          {/* VENDOR */}
          <TabsContent value="vendor">
            <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
              <div className="text-sm text-muted-foreground">Old Balance + Current Purchases = Total · Total − Paid = Remaining. “Paid Today” uses {fmtDate(date)}.</div>
              <Button onClick={exportVendor} disabled={vendorRows.length === 0}><Download className="h-4 w-4 mr-1" /> Download Vendor PDF</Button>
            </div>
            <div className="grid gap-2 md:grid-cols-2 mb-4">
              <StatCard label="Cash in hand — Opening" value={fmtMoney(overall.opening, sym)} />
              <StatCard label="Cash in hand — Current" value={fmtMoney(overall.closing, sym)} />
            </div>
            {vendorRows.length === 0 ? <EmptyState title="No vendors" description="Add vendors to this restaurant." /> : (
              <div className="border rounded-lg bg-card overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Vendor</TableHead>
                    <TableHead className="text-right">Old Balance</TableHead>
                    <TableHead className="text-right">Current Purchases</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Paid Today</TableHead>
                    <TableHead className="text-right">Remaining Balance</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {vendorRows.map(r => (
                      <TableRow key={r.vendor_id}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtMoney(r.old_balance, sym)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtMoney(r.current_purchases, sym)}</TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">{fmtMoney(r.total, sym)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtMoney(r.paid, sym)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtMoney(r.paid_today, sym)}</TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">{fmtMoney(r.remaining, sym)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/40 font-semibold">
                      <TableCell>Totals</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtMoney(vTotals.old, sym)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtMoney(vTotals.cur, sym)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtMoney(vTotals.total, sym)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtMoney(vTotals.paid, sym)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtMoney(vTotals.today, sym)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtMoney(vTotals.rem, sym)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          {/* CASH IN HAND */}
          <TabsContent value="cash">
            <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
              <div className="text-sm text-muted-foreground">Detailed cash movement with running balance.</div>
              <Button onClick={exportCashInHand}><Download className="h-4 w-4 mr-1" /> Download Cash in Hand PDF</Button>
            </div>
            <div className="grid gap-2 md:grid-cols-3 lg:grid-cols-6 mb-4">
              <StatCard label="Opening" value={fmtMoney(overall.opening, sym)} />
              <StatCard label="Received" value={fmtMoney(overall.received, sym)} />
              <StatCard label="Paid to vendors" value={fmtMoney(overall.paidVendors, sym)} />
              <StatCard label="Expenses" value={fmtMoney(overall.expenses, sym)} />
              <StatCard label="Cash in hand left" value={fmtMoney(overall.closing, sym)} />
              <StatCard label="Total remaining payable" value={fmtMoney(vTotals.rem, sym)} />
            </div>

            {cashRows.length === 0 ? <EmptyState title="No transactions" description="No cash movement in this period." /> : (
              <div className="border rounded-lg bg-card overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Date</TableHead><TableHead>Cash user</TableHead><TableHead>Paid to / Source</TableHead>
                    <TableHead>Type</TableHead><TableHead className="text-right">In</TableHead>
                    <TableHead className="text-right">Out</TableHead><TableHead className="text-right">Balance</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {cashRows.map(t => (
                      <TableRow key={t.kind + t.id}>
                        <TableCell>{fmtDate(t.date)}</TableCell>
                        <TableCell>{vaultName(t.vault_id)}</TableCell>
                        <TableCell className="font-medium">{t.party}</TableCell>
                        <TableCell>{t.kind}</TableCell>
                        <TableCell className="text-right tabular-nums">{t.inflow ? fmtMoney(t.inflow, sym) : "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{t.outflow ? fmtMoney(t.outflow, sym) : "—"}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">{fmtMoney(t.running, sym)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          {/* EXPENSES */}
          <TabsContent value="expenses">
            <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
              <div className="text-sm text-muted-foreground">Expenses & overheads for the selected period.</div>
              <Button onClick={exportExpenses} disabled={expenseRows.length === 0}><Download className="h-4 w-4 mr-1" /> Download Expenses PDF</Button>
            </div>
            {expenseRows.length === 0 ? <EmptyState title="No expenses" description="No expenses recorded in this period." /> : (
              <div className="border rounded-lg bg-card overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Date</TableHead><TableHead>Expense type</TableHead><TableHead>Cash user</TableHead>
                    <TableHead>Note</TableHead><TableHead className="text-right">Amount</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {expenseRows.map(e => (
                      <TableRow key={e.id}>
                        <TableCell>{fmtDate(e.expense_date)}</TableCell>
                        <TableCell className="font-medium">{e.expense_type}</TableCell>
                        <TableCell>{vaultName(e.vault_id)}</TableCell>
                        <TableCell className="text-muted-foreground">{e.note ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtMoney(e.amount, sym)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/40 font-semibold">
                      <TableCell colSpan={4}>Total</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtMoney(expenseRows.reduce((s, e) => s + Number(e.amount), 0), sym)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function CashView({ p, sym, vaultName }: { p: ReturnType<typeof cashPeriod>; sym: string; vaultName: (id: string) => string }) {
  return (
    <>
      <div className="grid gap-2 md:grid-cols-5 mb-4">
        <StatCard label="Opening cash" value={fmtMoney(p.opening, sym)} />
        <StatCard label="Cash received" value={fmtMoney(p.received, sym)} />
        <StatCard label="Paid to vendors" value={fmtMoney(p.paidVendors, sym)} />
        <StatCard label="Expenses" value={fmtMoney(p.expenses, sym)} />
        <StatCard label="Closing cash" value={fmtMoney(p.closing, sym)} />
      </div>

      <h2 className="text-sm font-semibold mb-2">Payments to vendors</h2>
      <div className="border rounded-lg bg-card overflow-x-auto mb-6">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Date</TableHead><TableHead>Paid to (vendor)</TableHead><TableHead>Type</TableHead>
            <TableHead>Cash user</TableHead><TableHead className="text-right">Amount</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {p.vendorRows.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-4 text-sm">No payments</TableCell></TableRow> :
              p.vendorRows.map(t => (
                <TableRow key={t.kind + t.id}>
                  <TableCell>{fmtDate(t.date)}</TableCell>
                  <TableCell className="font-medium">{t.party}</TableCell>
                  <TableCell>{t.kind}</TableCell>
                  <TableCell>{vaultName(t.vault_id)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtMoney(t.outflow, sym)}</TableCell>
                </TableRow>
              ))}
            <TableRow className="bg-muted/40 font-semibold">
              <TableCell colSpan={4}>Total paid</TableCell>
              <TableCell className="text-right tabular-nums">{fmtMoney(p.paidVendors, sym)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <h2 className="text-sm font-semibold mb-2">Expenses & overheads</h2>
      <div className="border rounded-lg bg-card overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Date</TableHead><TableHead>Expense type</TableHead><TableHead>Note</TableHead>
            <TableHead>Cash user</TableHead><TableHead className="text-right">Amount</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {p.expenseRows.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-4 text-sm">No expenses</TableCell></TableRow> :
              p.expenseRows.map(t => (
                <TableRow key={t.id}>
                  <TableCell>{fmtDate(t.date)}</TableCell>
                  <TableCell className="font-medium">{t.party}</TableCell>
                  <TableCell className="text-muted-foreground">{t.detail || "—"}</TableCell>
                  <TableCell>{vaultName(t.vault_id)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtMoney(t.outflow, sym)}</TableCell>
                </TableRow>
              ))}
            <TableRow className="bg-muted/40 font-semibold">
              <TableCell colSpan={4}>Total expenses</TableCell>
              <TableCell className="text-right tabular-nums">{fmtMoney(p.expenses, sym)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </>
  );
}
