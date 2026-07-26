import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { restaurantsQuery, vendorsQuery, vaultsQuery, purchasesQuery, paymentsQuery } from "@/lib/queries";
import { settingsQuery } from "@/lib/settings";
import { PageHeader, StatCard } from "@/components/page-shell";
import { fmtDateTime, fmtMoney } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMemo, useState } from "react";
import { Store, Users, Wallet, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Vendor & Cash Manager" }] }),
  component: Dashboard,
});

function Dashboard() {
  const settings = useQuery(settingsQuery());
  const sym = settings.data?.currency_symbol ?? "$";
  const restaurants = useQuery(restaurantsQuery());
  const vendors = useQuery(vendorsQuery());
  const vaults = useQuery(vaultsQuery());
  const purchases = useQuery(purchasesQuery());
  const payments = useQuery(paymentsQuery());
  const [selRest, setSelRest] = useState<string>("");

  const totalCash = useMemo(() => (vaults.data ?? []).filter(v => v.is_active).reduce((s, v) => s + Number(v.current_balance), 0), [vaults.data]);
  const totalOwed = useMemo(() => (vendors.data ?? []).filter(v => v.is_active).reduce((s, v) => s + Number(v.current_balance), 0), [vendors.data]);
  const activeVendors = (vendors.data ?? []).filter(v => v.is_active).length;
  const activeRestaurants = (restaurants.data ?? []).filter(r => r.is_active).length;

  const restVendors = useMemo(() => selRest ? (vendors.data ?? []).filter(v => v.restaurant_id === selRest) : [], [vendors.data, selRest]);
  const restCash = useMemo(() => selRest ? (vaults.data ?? []).filter(v => v.restaurant_id === selRest).reduce((s, v) => s + Number(v.current_balance), 0) : 0, [vaults.data, selRest]);
  const topOwed = useMemo(() => [...restVendors].sort((a, b) => Number(b.current_balance) - Number(a.current_balance)).slice(0, 5), [restVendors]);

  const activity = useMemo(() => {
    const p = (purchases.data ?? []).slice(0, 20).map(x => ({ t: x.created_at, kind: "Purchase", amount: x.amount, rest: x.restaurant_id, ref: x.id }));
    const y = (payments.data ?? []).slice(0, 20).map(x => ({ t: x.created_at, kind: "Payment", amount: x.amount, rest: x.restaurant_id, ref: x.id }));
    return [...p, ...y].sort((a, b) => (a.t < b.t ? 1 : -1)).slice(0, 10);
  }, [purchases.data, payments.data]);

  const restName = (id: string) => restaurants.data?.find(r => r.id === id)?.name ?? "—";

  return (
    <div>
      <PageHeader title="Dashboard" description="Live snapshot across all restaurants." />
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4 mb-6">
        <StatCard label="Restaurants" value={activeRestaurants} hint={`${(restaurants.data ?? []).length} total`} />
        <StatCard label="Active Vendors" value={activeVendors} />
        <StatCard label="Total Cash in Hand" value={fmtMoney(totalCash, sym)} hint="Across all vaults" />
        <StatCard label="Outstanding Payables" value={fmtMoney(totalOwed, sym)} hint="Sum of vendor balances" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-base">Restaurant snapshot</CardTitle>
              <Select value={selRest} onValueChange={setSelRest}>
                <SelectTrigger className="w-[220px]"><SelectValue placeholder="Pick a restaurant" /></SelectTrigger>
                <SelectContent>
                  {(restaurants.data ?? []).map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {!selRest ? <div className="text-sm text-muted-foreground">Select a restaurant to see details.</div> : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-md border p-3"><div className="text-xs text-muted-foreground">Cash in hand</div><div className="text-lg font-semibold tabular-nums">{fmtMoney(restCash, sym)}</div></div>
                  <div className="rounded-md border p-3"><div className="text-xs text-muted-foreground">Vendors</div><div className="text-lg font-semibold tabular-nums">{restVendors.length}</div></div>
                </div>
                <div>
                  <div className="text-xs uppercase text-muted-foreground mb-2">Top 5 by outstanding</div>
                  {topOwed.length === 0 ? <div className="text-sm text-muted-foreground">No vendors yet.</div> :
                    <ul className="divide-y border rounded-md">
                      {topOwed.map(v => (
                        <li key={v.id} className="flex justify-between px-3 py-2 text-sm">
                          <span>{v.name}</span>
                          <span className="tabular-nums">{fmtMoney(v.current_balance, sym)}</span>
                        </li>
                      ))}
                    </ul>}
                </div>
                <div className="flex gap-2 pt-1">
                  <Link to="/vendor-ledger" className="text-xs text-primary underline">Open ledger</Link>
                  <Link to="/report" className="text-xs text-primary underline">Open report</Link>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Recent activity</CardTitle></CardHeader>
          <CardContent>
            {activity.length === 0 ? <div className="text-sm text-muted-foreground">No activity yet.</div> :
              <ul className="divide-y border rounded-md">
                {activity.map((a, i) => (
                  <li key={i} className="flex justify-between px-3 py-2 text-sm">
                    <div><span className="font-medium">{a.kind}</span> <span className="text-muted-foreground">· {restName(a.rest)}</span></div>
                    <div className="flex items-center gap-3"><span className="tabular-nums">{fmtMoney(a.amount, sym)}</span><span className="text-xs text-muted-foreground">{fmtDateTime(a.t)}</span></div>
                  </li>
                ))}
              </ul>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
