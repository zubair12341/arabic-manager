import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { restaurantsQuery, vaultsQuery } from "@/lib/queries";
import { settingsQuery } from "@/lib/settings";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, TableSkeleton, EmptyState, StatCard } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download } from "lucide-react";
import { useMemo, useState } from "react";
import { fmtMoney } from "@/lib/format";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export const Route = createFileRoute("/_authenticated/report")({
  head: () => ({ meta: [{ title: "Report — Vendor & Cash Manager" }] }),
  component: ReportPage,
});

type Row = {
  vendor_id: string; vendor_name: string;
  opening_balance: number; total_purchased: number; total_paid: number;
  current_balance: number; total: number;
};

function ReportPage() {
  const restaurants = useQuery(restaurantsQuery());
  const settings = useQuery(settingsQuery());
  const vaults = useQuery(vaultsQuery());
  const sym = settings.data?.currency_symbol ?? "$";
  const [restId, setRestId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const report = useQuery({
    queryKey: ["report", restId, from, to],
    enabled: !!restId,
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase.rpc("restaurant_vendor_report", {
        _restaurant_id: restId,
        _from: from ? new Date(from).toISOString() : undefined,
        _to: to ? new Date(new Date(to).getTime() + 86400000).toISOString() : undefined,
      });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const rows = report.data ?? [];
  const totals = rows.reduce((a, r) => ({
    opening: a.opening + Number(r.opening_balance),
    purchased: a.purchased + Number(r.total_purchased),
    paid: a.paid + Number(r.total_paid),
    current: a.current + Number(r.current_balance),
    combined: a.combined + Number(r.total),
  }), { opening: 0, purchased: 0, paid: 0, current: 0, combined: 0 });

  const restaurant = restaurants.data?.find(r => r.id === restId);
  const restName = restaurant?.name ?? "";

  const cash = useMemo(() => {
    const restVaults = (vaults.data ?? []).filter(v => v.restaurant_id === restId);
    return {
      opening: Number(restaurant?.opening_cash_balance ?? 0),
      current: restVaults.reduce((s, v) => s + Number(v.current_balance), 0),
    };
  }, [vaults.data, restId, restaurant]);

  const exportPdf = () => {
    const doc = new jsPDF();
    doc.setFontSize(14); doc.text(`Vendor Report — ${restName}`, 14, 16);
    doc.setFontSize(9);
    let y = 22;
    if (from || to) { doc.text(`Period: ${from || "—"} to ${to || "—"}`, 14, y); y += 5; }
    doc.text(`Cash in hand — Opening: ${fmtMoney(cash.opening, sym)}   Current: ${fmtMoney(cash.current, sym)}`, 14, y);
    autoTable(doc, {
      startY: y + 4,
      head: [["Vendor", "Opening", "Purchased", "Paid", "Current", "Total"]],
      body: rows.map(r => [
        r.vendor_name, fmtMoney(r.opening_balance, sym), fmtMoney(r.total_purchased, sym),
        fmtMoney(r.total_paid, sym), fmtMoney(r.current_balance, sym), fmtMoney(r.total, sym),
      ]),
      foot: [["Totals", fmtMoney(totals.opening, sym), fmtMoney(totals.purchased, sym), fmtMoney(totals.paid, sym), fmtMoney(totals.current, sym), fmtMoney(totals.combined, sym)]],
      styles: { fontSize: 8 }, headStyles: { fillColor: [30, 41, 59] },
    });
    doc.save(`report-${restName}-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  return (
    <div>
      <PageHeader title="Restaurant Report" description="Vendor-wise balances and activity for a restaurant."
        action={<Button onClick={exportPdf} disabled={rows.length === 0}><Download className="h-4 w-4 mr-1" /> Export PDF</Button>} />

      <div className="grid gap-2 md:grid-cols-4 mb-4">
        <Select value={restId} onValueChange={setRestId}>
          <SelectTrigger><SelectValue placeholder="Restaurant" /></SelectTrigger>
          <SelectContent>{(restaurants.data ?? []).map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
        </Select>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>

      {!restId ? <EmptyState title="Pick a restaurant" description="Choose a restaurant to run the report." /> :
        report.isLoading ? <TableSkeleton /> : (
        <>
          <div className="grid gap-2 md:grid-cols-2 mb-4">
            <StatCard label="Cash in hand — Opening" value={fmtMoney(cash.opening, sym)} />
            <StatCard label="Cash in hand — Current" value={fmtMoney(cash.current, sym)} />
          </div>
          {rows.length === 0 ? <EmptyState title="No vendor data" description="No vendors or transactions in the selected period." /> :
        <div className="border rounded-lg bg-card overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Vendor</TableHead>
              <TableHead className="text-right">Opening / Old</TableHead>
              <TableHead className="text-right">Purchased (period)</TableHead>
              <TableHead className="text-right">Paid</TableHead>
              <TableHead className="text-right">Current</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.map(r => (
                <TableRow key={r.vendor_id}>
                  <TableCell className="font-medium">{r.vendor_name}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtMoney(r.opening_balance, sym)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtMoney(r.total_purchased, sym)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtMoney(r.total_paid, sym)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtMoney(r.current_balance, sym)}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">{fmtMoney(r.total, sym)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/40 font-semibold">
                <TableCell>Totals</TableCell>
                <TableCell className="text-right tabular-nums">{fmtMoney(totals.opening, sym)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtMoney(totals.purchased, sym)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtMoney(totals.paid, sym)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtMoney(totals.current, sym)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtMoney(totals.combined, sym)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>}
    </div>
  );
}
