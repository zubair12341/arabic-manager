import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { restaurantsQuery, vendorsQuery, type Vendor } from "@/lib/queries";
import { settingsQuery } from "@/lib/settings";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, StatCard, TableSkeleton, EmptyState } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download } from "lucide-react";
import { useMemo, useState } from "react";
import { fmtMoney, fmtDate } from "@/lib/format";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export const Route = createFileRoute("/_authenticated/vendor-ledger")({
  head: () => ({ meta: [{ title: "Vendor Ledger — Vendor & Cash Manager" }] }),
  component: LedgerPage,
});

type Entry = {
  entry_date: string; entry_type: "opening" | "purchase" | "payment";
  description: string; debit: number; credit: number;
};

function LedgerPage() {
  const restaurants = useQuery(restaurantsQuery());
  const [restId, setRestId] = useState<string>("");
  const [vendorId, setVendorId] = useState<string>("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const vendors = useQuery({ ...vendorsQuery(restId || null), enabled: !!restId });
  const settings = useQuery(settingsQuery());
  const sym = settings.data?.currency_symbol ?? "$";

  const vendor = vendors.data?.find(v => v.id === vendorId);

  const entriesQ = useQuery({
    queryKey: ["ledger", vendorId, from, to],
    enabled: !!vendorId,
    queryFn: async (): Promise<Entry[]> => {
      const v = vendor as Vendor;
      const opening: Entry = {
        entry_date: v.created_at,
        entry_type: "opening",
        description: "Opening balance",
        debit: Number(v.opening_balance) > 0 ? Number(v.opening_balance) : 0,
        credit: Number(v.opening_balance) < 0 ? -Number(v.opening_balance) : 0,
      };
      const [pur, pay] = await Promise.all([
        supabase.from("purchases").select("*").eq("vendor_id", vendorId).eq("is_deleted", false),
        supabase.from("payments").select("*").eq("vendor_id", vendorId).eq("is_deleted", false),
      ]);
      if (pur.error) throw pur.error; if (pay.error) throw pay.error;
      const rows: Entry[] = [opening];
      for (const p of pur.data ?? []) {
        const credit = p.payment_type === "credit" ? Number(p.amount) : p.payment_type === "cash" ? 0 : Math.max(Number(p.amount) - Number(p.amount_paid_now), 0);
        rows.push({
          entry_date: p.purchase_date,
          entry_type: "purchase",
          description: `Purchase (${p.payment_type})${p.details ? " — " + p.details : ""}`,
          debit: credit, credit: 0,
        });
      }
      for (const p of pay.data ?? []) {
        rows.push({
          entry_date: p.payment_date,
          entry_type: "payment",
          description: `Payment${p.note ? " — " + p.note : ""}`,
          debit: 0, credit: Number(p.amount),
        });
      }
      const rank = (t: Entry["entry_type"]) => (t === "opening" ? 0 : t === "purchase" ? 1 : 2);
      rows.sort((a, b) => {
        if (a.entry_type === "opening") return -1;
        if (b.entry_type === "opening") return 1;
        return a.entry_date.localeCompare(b.entry_date) || rank(a.entry_type) - rank(b.entry_type);
      });
      return rows;
    },
  });

  const filtered = useMemo(() => (entriesQ.data ?? []).filter(e =>
    e.entry_type === "opening" ||
    ((!from || e.entry_date >= from) &&
      (!to || e.entry_date <= new Date(new Date(to).getTime() + 86400000).toISOString()))
  ), [entriesQ.data, from, to]);

  const totals = useMemo(() => {
    let running = 0, debit = 0, credit = 0;
    const withRunning = filtered.map(e => {
      running += e.debit - e.credit;
      if (e.entry_type !== "opening") { debit += e.debit; credit += e.credit; }
      return { ...e, running };
    });
    return { rows: withRunning, debit, credit, closing: running };
  }, [filtered]);

  const exportPdf = () => {
    if (!vendor) return;
    const doc = new jsPDF();
    doc.setFontSize(14); doc.text(`Vendor Ledger — ${vendor.name}`, 14, 16);
    doc.setFontSize(9); doc.text(`Restaurant: ${restaurants.data?.find(r => r.id === restId)?.name ?? ""}`, 14, 22);
    if (from || to) doc.text(`Period: ${from || "—"} to ${to || "—"}`, 14, 27);
    autoTable(doc, {
      startY: 32,
      head: [["Date", "Type", "Description", "Debit", "Credit", "Balance"]],
      body: totals.rows.map(r => [fmtDate(r.entry_date), r.entry_type, r.description, fmtMoney(r.debit, sym), fmtMoney(r.credit, sym), fmtMoney(r.running, sym)]),
      foot: [["", "", "Totals", fmtMoney(totals.debit, sym), fmtMoney(totals.credit, sym), fmtMoney(totals.closing, sym)]],
      styles: { fontSize: 8 }, headStyles: { fillColor: [30, 41, 59] },
    });
    doc.save(`ledger-${vendor.name}-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  return (
    <div>
      <PageHeader title="Vendor Ledger" description="Chronological running balance for a single vendor."
        action={<Button onClick={exportPdf} disabled={!vendor || totals.rows.length === 0}><Download className="h-4 w-4 mr-1" /> Export PDF</Button>} />

      <div className="grid gap-2 md:grid-cols-4 mb-4">
        <Select value={restId} onValueChange={(v) => { setRestId(v); setVendorId(""); }}>
          <SelectTrigger><SelectValue placeholder="Restaurant" /></SelectTrigger>
          <SelectContent>{(restaurants.data ?? []).map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={vendorId} onValueChange={setVendorId} disabled={!restId}>
          <SelectTrigger><SelectValue placeholder="Vendor" /></SelectTrigger>
          <SelectContent>{(vendors.data ?? []).filter(v => v.is_active).map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
        </Select>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="From" />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} placeholder="To" />
      </div>

      {vendor && (
        <div className="grid gap-3 md:grid-cols-4 mb-4">
          <StatCard label="Opening balance" value={fmtMoney(vendor.opening_balance, sym)} />
          <StatCard label="Total debit (period)" value={fmtMoney(totals.debit, sym)} />
          <StatCard label="Total credit (period)" value={fmtMoney(totals.credit, sym)} />
          <StatCard label="Closing balance" value={fmtMoney(totals.closing, sym)} />
        </div>
      )}

      {!vendorId ? <EmptyState title="Pick a vendor" description="Select a restaurant and vendor to see the ledger." /> :
        entriesQ.isLoading ? <TableSkeleton /> :
        totals.rows.length === 0 ? <EmptyState title="No entries in period" description="Try widening the date range." /> :
        <div className="border rounded-lg bg-card overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Description</TableHead>
              <TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Credit</TableHead><TableHead className="text-right">Balance</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {totals.rows.map((r, i) => (
                <TableRow key={i}>
                  <TableCell>{fmtDate(r.entry_date)}</TableCell>
                  <TableCell className="capitalize">{r.entry_type}</TableCell>
                  <TableCell>{r.description}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.debit ? fmtMoney(r.debit, sym) : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.credit ? fmtMoney(r.credit, sym) : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{fmtMoney(r.running, sym)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/40 font-semibold">
                <TableCell colSpan={3}>Totals</TableCell>
                <TableCell className="text-right tabular-nums">{fmtMoney(totals.debit, sym)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtMoney(totals.credit, sym)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtMoney(totals.closing, sym)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>}
    </div>
  );
}
