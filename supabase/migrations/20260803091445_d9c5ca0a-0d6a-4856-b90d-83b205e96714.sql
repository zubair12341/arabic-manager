CREATE TABLE public.daily_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  sale_date date NOT NULL,
  counter_vault_id uuid REFERENCES public.vaults(id) ON DELETE SET NULL,
  total_sale numeric NOT NULL DEFAULT 0,
  cash_sale numeric NOT NULL DEFAULT 0,
  udhaar_sale numeric NOT NULL DEFAULT 0,
  online_sale numeric NOT NULL DEFAULT 0,
  pending_online_recv numeric NOT NULL DEFAULT 0,
  discount numeric NOT NULL DEFAULT 0,
  other_income numeric NOT NULL DEFAULT 0,
  actual_cash_counted numeric,
  is_closed boolean NOT NULL DEFAULT false,
  closed_at timestamptz,
  closed_by uuid,
  notes text,
  is_deleted boolean NOT NULL DEFAULT false,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT daily_sales_unique_day UNIQUE (restaurant_id, sale_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_sales TO authenticated;
GRANT ALL ON public.daily_sales TO service_role;
ALTER TABLE public.daily_sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can manage daily_sales" ON public.daily_sales
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER daily_sales_set_updated_at BEFORE UPDATE ON public.daily_sales
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER daily_sales_log_activity AFTER INSERT OR UPDATE OR DELETE ON public.daily_sales
  FOR EACH ROW EXECUTE FUNCTION public.tg_log_activity();

ALTER TABLE public.expenses
  ADD COLUMN category text,
  ADD COLUMN daily_sale_id uuid REFERENCES public.daily_sales(id) ON DELETE SET NULL;

ALTER TABLE public.vault_deposits
  ADD COLUMN daily_sale_id uuid REFERENCES public.daily_sales(id) ON DELETE SET NULL,
  ADD COLUMN transfer_group_id uuid,
  ADD COLUMN kind text;

CREATE INDEX idx_expenses_daily_sale ON public.expenses(daily_sale_id);
CREATE INDEX idx_vault_deposits_daily_sale ON public.vault_deposits(daily_sale_id);

-- Keep exactly ONE cash-sale deposit row against the counter vault per day.
CREATE OR REPLACE FUNCTION public.tg_daily_sales_counter_deposit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  existing_id uuid;
BEGIN
  SELECT id INTO existing_id FROM public.vault_deposits
    WHERE daily_sale_id = NEW.id AND kind = 'cash_sale' LIMIT 1;

  IF NEW.is_deleted OR NEW.counter_vault_id IS NULL OR COALESCE(NEW.cash_sale, 0) = 0 THEN
    IF existing_id IS NOT NULL THEN
      DELETE FROM public.vault_deposits WHERE id = existing_id;
    END IF;
    RETURN NEW;
  END IF;

  IF existing_id IS NULL THEN
    INSERT INTO public.vault_deposits (restaurant_id, vault_id, amount, note, deposit_date, daily_sale_id, kind)
    VALUES (NEW.restaurant_id, NEW.counter_vault_id, NEW.cash_sale,
            'Daily cash sale', (NEW.sale_date::timestamp + interval '12 hours') AT TIME ZONE 'UTC',
            NEW.id, 'cash_sale');
  ELSE
    UPDATE public.vault_deposits
      SET amount = NEW.cash_sale,
          vault_id = NEW.counter_vault_id,
          restaurant_id = NEW.restaurant_id,
          deposit_date = (NEW.sale_date::timestamp + interval '12 hours') AT TIME ZONE 'UTC'
      WHERE id = existing_id;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER daily_sales_counter_deposit
AFTER INSERT OR UPDATE ON public.daily_sales
FOR EACH ROW EXECUTE FUNCTION public.tg_daily_sales_counter_deposit();

-- Atomic counter -> vault transfer for a given day (both legs always move together).
CREATE OR REPLACE FUNCTION public.set_daily_cash_transfer(
  p_daily_sale_id uuid,
  p_to_vault_id uuid,
  p_amount numeric
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  ds public.daily_sales%ROWTYPE;
  in_id uuid; out_id uuid; grp uuid;
  ts timestamptz;
BEGIN
  SELECT * INTO ds FROM public.daily_sales WHERE id = p_daily_sale_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Daily sale row not found'; END IF;
  IF ds.counter_vault_id IS NULL THEN RAISE EXCEPTION 'No counter cash user selected for this day'; END IF;
  IF p_to_vault_id = ds.counter_vault_id THEN RAISE EXCEPTION 'Cannot transfer the counter to itself'; END IF;

  ts := (ds.sale_date::timestamp + interval '12 hours') AT TIME ZONE 'UTC';

  SELECT id, transfer_group_id INTO in_id, grp FROM public.vault_deposits
    WHERE daily_sale_id = p_daily_sale_id AND kind = 'transfer_in' AND vault_id = p_to_vault_id LIMIT 1;
  IF grp IS NOT NULL THEN
    SELECT id INTO out_id FROM public.vault_deposits
      WHERE transfer_group_id = grp AND kind = 'transfer_out' LIMIT 1;
  END IF;

  IF COALESCE(p_amount, 0) <= 0 THEN
    IF in_id IS NOT NULL THEN DELETE FROM public.vault_deposits WHERE id = in_id; END IF;
    IF out_id IS NOT NULL THEN DELETE FROM public.vault_deposits WHERE id = out_id; END IF;
    RETURN;
  END IF;

  IF in_id IS NULL THEN
    grp := gen_random_uuid();
    INSERT INTO public.vault_deposits (restaurant_id, vault_id, amount, note, deposit_date, daily_sale_id, transfer_group_id, kind)
    VALUES (ds.restaurant_id, ds.counter_vault_id, -p_amount, 'Cash handed over from counter', ts, p_daily_sale_id, grp, 'transfer_out');
    INSERT INTO public.vault_deposits (restaurant_id, vault_id, amount, note, deposit_date, daily_sale_id, transfer_group_id, kind)
    VALUES (ds.restaurant_id, p_to_vault_id, p_amount, 'Cash received from counter', ts, p_daily_sale_id, grp, 'transfer_in');
  ELSE
    UPDATE public.vault_deposits SET amount = p_amount, vault_id = p_to_vault_id, deposit_date = ts WHERE id = in_id;
    IF out_id IS NULL THEN
      INSERT INTO public.vault_deposits (restaurant_id, vault_id, amount, note, deposit_date, daily_sale_id, transfer_group_id, kind)
      VALUES (ds.restaurant_id, ds.counter_vault_id, -p_amount, 'Cash handed over from counter', ts, p_daily_sale_id, grp, 'transfer_out');
    ELSE
      UPDATE public.vault_deposits SET amount = -p_amount, vault_id = ds.counter_vault_id, deposit_date = ts WHERE id = out_id;
    END IF;
  END IF;
END; $$;

GRANT EXECUTE ON FUNCTION public.set_daily_cash_transfer(uuid, uuid, numeric) TO authenticated;