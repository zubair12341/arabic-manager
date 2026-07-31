CREATE OR REPLACE FUNCTION public.tg_guard_vendor_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.purchases
    WHERE vendor_id = OLD.id AND is_deleted = false
  ) OR EXISTS (
    SELECT 1 FROM public.payments
    WHERE vendor_id = OLD.id AND is_deleted = false
  ) THEN
    RAISE EXCEPTION 'Cannot delete vendor with existing transactions. Deactivate instead.' USING ERRCODE = 'P0001';
  END IF;
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_vendor_opening_balance_adjustment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.opening_balance IS DISTINCT FROM OLD.opening_balance THEN
    NEW.current_balance := NEW.current_balance + (NEW.opening_balance - OLD.opening_balance);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vendor_opening_balance_adjustment_trg ON public.vendors;
CREATE TRIGGER vendor_opening_balance_adjustment_trg
BEFORE UPDATE OF opening_balance ON public.vendors
FOR EACH ROW
EXECUTE FUNCTION public.tg_vendor_opening_balance_adjustment();