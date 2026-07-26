
ALTER FUNCTION public.tg_set_updated_at() SET search_path = public;
ALTER FUNCTION public.tg_vendors_init_balance() SET search_path = public;
ALTER FUNCTION public.tg_vendors_adjust_opening() SET search_path = public;
ALTER FUNCTION public.tg_vaults_init_balance() SET search_path = public;
ALTER FUNCTION public.tg_vaults_adjust_opening() SET search_path = public;
ALTER FUNCTION public.purchase_credit_portion(public.payment_type, numeric, numeric) SET search_path = public;
ALTER FUNCTION public.tg_purchases_balance() SET search_path = public;
ALTER FUNCTION public.tg_payments_balance() SET search_path = public;
ALTER FUNCTION public.tg_guard_restaurant_delete() SET search_path = public;
ALTER FUNCTION public.tg_guard_vendor_delete() SET search_path = public;
ALTER FUNCTION public.tg_guard_vault_delete() SET search_path = public;
