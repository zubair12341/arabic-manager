import type { Purchase, Payment, VaultDeposit, Expense, Vendor, Vault } from "@/lib/queries";

export type Txn = {
  id: string;
  date: string;
  restaurant_id: string;
  vault_id: string;
  kind: "Cash added" | "Payment" | "Purchase (cash)" | "Expense";
  party: string;      // vendor / paid-to / expense type
  detail: string;
  inflow: number;
  outflow: number;
};

export function buildTxns(args: {
  purchases: Purchase[];
  payments: Payment[];
  deposits: VaultDeposit[];
  expenses: Expense[];
  vendors: Vendor[];
}): Txn[] {
  const vName = (id: string) => args.vendors.find(v => v.id === id)?.name ?? "Unknown vendor";
  const out: Txn[] = [];

  for (const d of args.deposits) {
    out.push({
      id: d.id, date: d.deposit_date, restaurant_id: d.restaurant_id, vault_id: d.vault_id,
      kind: "Cash added", party: "Cash received", detail: d.note ?? "", inflow: Number(d.amount), outflow: 0,
    });
  }
  for (const p of args.payments) {
    out.push({
      id: p.id, date: p.payment_date, restaurant_id: p.restaurant_id, vault_id: p.vault_id,
      kind: "Payment", party: vName(p.vendor_id), detail: p.note ?? "", inflow: 0, outflow: Number(p.amount),
    });
  }
  for (const p of args.purchases) {
    if (!p.vault_id || Number(p.amount_paid_now) <= 0) continue;
    out.push({
      id: p.id, date: p.purchase_date, restaurant_id: p.restaurant_id, vault_id: p.vault_id,
      kind: "Purchase (cash)", party: vName(p.vendor_id), detail: p.details ?? "",
      inflow: 0, outflow: Number(p.amount_paid_now),
    });
  }
  for (const e of args.expenses) {
    out.push({
      id: e.id, date: e.expense_date, restaurant_id: e.restaurant_id, vault_id: e.vault_id,
      kind: "Expense", party: e.expense_type, detail: e.note ?? "", inflow: 0, outflow: Number(e.amount),
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export const dayStart = (d: string) => new Date(`${d}T00:00:00`).toISOString();
export const dayEnd = (d: string) => new Date(new Date(`${d}T00:00:00`).getTime() + 86400000).toISOString();

export type CashPeriod = {
  opening: number;
  received: number;
  paidVendors: number;
  expenses: number;
  closing: number;
  vendorRows: Txn[];
  expenseRows: Txn[];
  receivedRows: Txn[];
  rows: Txn[];
};

/** Cash movement for a restaurant (optionally a single vault) between [from, to). */
export function cashPeriod(args: {
  txns: Txn[];
  vaults: Vault[];
  restaurantId: string;
  vaultId?: string | null;
  from?: string | null;   // ISO
  to?: string | null;     // ISO (exclusive)
}): CashPeriod {
  const scope = (t: Txn) =>
    t.restaurant_id === args.restaurantId && (!args.vaultId || t.vault_id === args.vaultId);

  const scopedVaults = args.vaults.filter(
    v => v.restaurant_id === args.restaurantId && (!args.vaultId || v.id === args.vaultId),
  );
  const vaultOpening = scopedVaults.reduce((s, v) => s + Number(v.opening_balance), 0);

  const all = args.txns.filter(scope);
  const before = args.from ? all.filter(t => t.date < args.from!) : [];
  const opening = vaultOpening + before.reduce((s, t) => s + t.inflow - t.outflow, 0);

  const rows = all.filter(t => (!args.from || t.date >= args.from) && (!args.to || t.date < args.to));
  const receivedRows = rows.filter(t => t.kind === "Cash added");
  const vendorRows = rows.filter(t => t.kind === "Payment" || t.kind === "Purchase (cash)");
  const expenseRows = rows.filter(t => t.kind === "Expense");
  const sum = (list: Txn[], k: "inflow" | "outflow") => list.reduce((s, t) => s + t[k], 0);

  const received = sum(receivedRows, "inflow");
  const paidVendors = sum(vendorRows, "outflow");
  const expenses = sum(expenseRows, "outflow");

  return {
    opening, received, paidVendors, expenses,
    closing: opening + received - paidVendors - expenses,
    vendorRows, expenseRows, receivedRows, rows,
  };
}

export type VendorRow = {
  vendor_id: string;
  name: string;
  old_balance: number;
  current_purchases: number;
  total: number;
  paid: number;
  paid_today: number;
  remaining: number;
};

/** Vendor balances for a restaurant: Old + Purchases = Total; Total - Paid = Remaining. */
export function vendorReport(args: {
  vendors: Vendor[];
  purchases: Purchase[];
  payments: Payment[];
  restaurantId: string;
  from?: string | null;
  to?: string | null;
  todayFrom?: string | null;
  todayTo?: string | null;
}): VendorRow[] {
  const inRange = (d: string, from?: string | null, to?: string | null) =>
    (!from || d >= from) && (!to || d < to);

  return args.vendors
    .filter(v => v.restaurant_id === args.restaurantId)
    .map(v => {
      const purchases = args.purchases.filter(p => p.vendor_id === v.id);
      const payments = args.payments.filter(p => p.vendor_id === v.id);

      // Credit carried before the period start = old balance
      const priorCredit = purchases
        .filter(p => args.from && p.purchase_date < args.from!)
        .reduce((s, p) => s + creditPortion(p), 0);
      const priorPaid = payments
        .filter(p => args.from && p.payment_date < args.from!)
        .reduce((s, p) => s + Number(p.amount), 0);
      const old_balance = Number(v.opening_balance) + priorCredit - priorPaid;

      const current_purchases = purchases
        .filter(p => inRange(p.purchase_date, args.from, args.to))
        .reduce((s, p) => s + Number(p.amount), 0);
      const paid = payments
        .filter(p => inRange(p.payment_date, args.from, args.to))
        .reduce((s, p) => s + Number(p.amount), 0)
        + purchases.filter(p => inRange(p.purchase_date, args.from, args.to))
          .reduce((s, p) => s + Number(p.amount_paid_now), 0);
      const paid_today = payments
        .filter(p => inRange(p.payment_date, args.todayFrom, args.todayTo))
        .reduce((s, p) => s + Number(p.amount), 0)
        + purchases.filter(p => inRange(p.purchase_date, args.todayFrom, args.todayTo))
          .reduce((s, p) => s + Number(p.amount_paid_now), 0);

      const total = old_balance + current_purchases;
      return { vendor_id: v.id, name: v.name, old_balance, current_purchases, total, paid, paid_today, remaining: total - paid };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function creditPortion(p: Purchase) {
  if (p.payment_type === "credit") return Number(p.amount);
  if (p.payment_type === "cash") return 0;
  return Math.max(Number(p.amount) - Number(p.amount_paid_now), 0);
}
