CREATE OR REPLACE FUNCTION public.tg_guard_vendor_delete()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.purchases WHERE vendor_id = OLD.id)
     OR EXISTS (SELECT 1 FROM public.payments WHERE vendor_id = OLD.id) THEN
    RAISE EXCEPTION 'Cannot delete vendor with existing transactions. Deactivate instead.' USING ERRCODE = 'P0001';
  END IF;
  RETURN OLD;
END; $$;

CREATE OR REPLACE FUNCTION public.tg_guard_vault_delete()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.purchases WHERE vault_id = OLD.id)
     OR EXISTS (SELECT 1 FROM public.payments WHERE vault_id = OLD.id) THEN
    RAISE EXCEPTION 'Cannot delete vault with existing transactions. Deactivate instead.' USING ERRCODE = 'P0001';
  END IF;
  RETURN OLD;
END; $$;