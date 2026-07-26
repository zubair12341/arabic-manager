import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AppSettings = {
  business_name: string;
  currency_symbol: string;
  currency_code: string;
};

export const settingsQuery = () =>
  queryOptions({
    queryKey: ["app_settings"],
    queryFn: async (): Promise<AppSettings> => {
      const { data, error } = await supabase.from("app_settings").select("*").eq("id", 1).maybeSingle();
      if (error) throw error;
      return (data as AppSettings) ?? { business_name: "My Restaurant Group", currency_symbol: "$", currency_code: "USD" };
    },
    staleTime: 60_000,
  });
