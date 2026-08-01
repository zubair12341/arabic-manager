CREATE OR REPLACE FUNCTION public.tg_guard_vendor_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF EXISTS (SELECT 1 FROM public.purchases WHERE vendor_id = OLD.id AND is_deleted = false)
     OR EXISTS (SELECT 1 FROM public.payments WHERE vendor_id = OLD.id AND is_deleted = false) THEN
    RAISE EXCEPTION 'Cannot delete vendor with existing transactions. Deactivate instead.' USING ERRCODE = 'P0001';
  END IF;

  -- Remove archived (soft-deleted) rows so the foreign keys don't block deletion
  DELETE FROM public.purchases WHERE vendor_id = OLD.id AND is_deleted = true;
  DELETE FROM public.payments WHERE vendor_id = OLD.id AND is_deleted = true;

  RETURN OLD;
END;
$function$;