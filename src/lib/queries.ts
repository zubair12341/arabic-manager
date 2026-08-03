import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Restaurant = {
  id: string; name: string; address: string | null; phone: string | null;
  opening_cash_balance: number; is_active: boolean;
  created_at: string; updated_at: string;
};
export type Vendor = {
  id: string; restaurant_id: string; name: string; phone: string | null; address: string | null;
  account_number: string | null;
  opening_balance: number; current_balance: number; is_active: boolean;
  created_at: string; updated_at: string;
};
export type Vault = {
  id: string; restaurant_id: string; vault_user_name: string;
  opening_balance: number; current_balance: number; is_active: boolean;
  created_at: string; updated_at: string;
};
export type Purchase = {
  id: string; restaurant_id: string; vendor_id: string; vault_id: string | null;
  amount: number; payment_type: "cash" | "credit" | "partial"; amount_paid_now: number;
  details: string | null; invoice_images: string[]; purchase_date: string;
  is_deleted: boolean; created_at: string;
};
export type Payment = {
  id: string; restaurant_id: string; vault_id: string; vendor_id: string;
  amount: number; note: string | null; payment_images: string[]; payment_date: string;
  is_deleted: boolean; created_at: string;
};

export type VaultDeposit = {
  id: string; restaurant_id: string; vault_id: string;
  amount: number; note: string | null; deposit_date: string;
  is_deleted: boolean; created_at: string;
  daily_sale_id: string | null; transfer_group_id: string | null; kind: string | null;
};

export type Expense = {
  id: string; restaurant_id: string; vault_id: string;
  expense_type: string; amount: number; note: string | null; expense_date: string;
  is_deleted: boolean; created_at: string;
  category: string | null; daily_sale_id: string | null;
};

export type DailySale = {
  id: string; restaurant_id: string; sale_date: string; counter_vault_id: string | null;
  total_sale: number; cash_sale: number; udhaar_sale: number; online_sale: number;
  pending_online_recv: number; discount: number; other_income: number;
  actual_cash_counted: number | null;
  is_closed: boolean; closed_at: string | null; closed_by: string | null;
  notes: string | null; is_deleted: boolean; created_at: string; updated_at: string;
};

export const dailySalesQuery = (restaurantId?: string | null) =>
  queryOptions({
    queryKey: ["daily_sales", restaurantId ?? "all"],
    queryFn: async () => {
      let q = supabase.from("daily_sales").select("*").eq("is_deleted", false).order("sale_date", { ascending: false });
      if (restaurantId) q = q.eq("restaurant_id", restaurantId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as DailySale[];
    },
  });

export const expensesQuery = () =>
  queryOptions({
    queryKey: ["expenses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("expenses").select("*")
        .eq("is_deleted", false).order("expense_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Expense[];
    },
  });

export const vaultDepositsQuery = () =>
  queryOptions({
    queryKey: ["vault_deposits"],
    queryFn: async () => {
      const { data, error } = await supabase.from("vault_deposits").select("*")
        .eq("is_deleted", false).order("deposit_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as VaultDeposit[];
    },
  });



export const restaurantsQuery = () =>
  queryOptions({
    queryKey: ["restaurants"],
    queryFn: async () => {
      const { data, error } = await supabase.from("restaurants").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as Restaurant[];
    },
  });

export const vendorsQuery = (restaurantId?: string | null) =>
  queryOptions({
    queryKey: ["vendors", restaurantId ?? "all"],
    queryFn: async () => {
      let q = supabase.from("vendors").select("*").order("name");
      if (restaurantId) q = q.eq("restaurant_id", restaurantId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Vendor[];
    },
  });

export const vaultsQuery = (restaurantId?: string | null) =>
  queryOptions({
    queryKey: ["vaults", restaurantId ?? "all"],
    queryFn: async () => {
      let q = supabase.from("vaults").select("*").order("vault_user_name");
      if (restaurantId) q = q.eq("restaurant_id", restaurantId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Vault[];
    },
  });

export const purchasesQuery = () =>
  queryOptions({
    queryKey: ["purchases"],
    queryFn: async () => {
      const { data, error } = await supabase.from("purchases").select("*")
        .eq("is_deleted", false).order("purchase_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Purchase[];
    },
  });

export const paymentsQuery = () =>
  queryOptions({
    queryKey: ["payments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("payments").select("*")
        .eq("is_deleted", false).order("payment_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Payment[];
    },
  });
