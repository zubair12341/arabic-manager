CREATE OR REPLACE FUNCTION public.clear_all_business_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can clear data' USING ERRCODE = '42501';
  END IF;
  SET LOCAL session_replication_role = replica;
  DELETE FROM public.payments;
  DELETE FROM public.purchases;
  DELETE FROM public.vaults;
  DELETE FROM public.vendors;
  DELETE FROM public.restaurants;
  DELETE FROM public.activity_log;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_all_business_data() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clear_all_business_data() TO authenticated;