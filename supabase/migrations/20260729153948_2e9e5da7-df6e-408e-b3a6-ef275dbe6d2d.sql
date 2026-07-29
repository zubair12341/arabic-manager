CREATE TABLE public.vault_deposits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id),
  vault_id uuid NOT NULL REFERENCES public.vaults(id),
  amount numeric NOT NULL,
  note text,
  deposit_date timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vault_deposits TO authenticated;
GRANT ALL ON public.vault_deposits TO service_role;

ALTER TABLE public.vault_deposits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth all vault_deposits" ON public.vault_deposits
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER vault_deposits_set_updated_at
  BEFORE UPDATE ON public.vault_deposits
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE OR REPLACE FUNCTION public.tg_vault_deposits_balance()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') AND NOT OLD.is_deleted THEN
    UPDATE public.vaults SET current_balance = current_balance - OLD.amount WHERE id = OLD.vault_id;
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') AND NOT NEW.is_deleted THEN
    UPDATE public.vaults SET current_balance = current_balance + NEW.amount WHERE id = NEW.vault_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;

CREATE TRIGGER vault_deposits_balance_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.vault_deposits
  FOR EACH ROW EXECUTE FUNCTION public.tg_vault_deposits_balance();

CREATE TRIGGER vault_deposits_log
  AFTER INSERT OR UPDATE OR DELETE ON public.vault_deposits
  FOR EACH ROW EXECUTE FUNCTION public.tg_log_activity();

CREATE OR REPLACE FUNCTION public.tg_guard_vault_delete()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.purchases WHERE vault_id = OLD.id)
     OR EXISTS (SELECT 1 FROM public.payments WHERE vault_id = OLD.id)
     OR EXISTS (SELECT 1 FROM public.vault_deposits WHERE vault_id = OLD.id) THEN
    RAISE EXCEPTION 'Cannot delete vault with existing transactions. Deactivate instead.' USING ERRCODE = 'P0001';
  END IF;
  RETURN OLD;
END; $$;

CREATE OR REPLACE FUNCTION public.clear_all_business_data()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can clear data' USING ERRCODE = '42501';
  END IF;
  SET LOCAL session_replication_role = replica;
  DELETE FROM public.vault_deposits;
  DELETE FROM public.payments;
  DELETE FROM public.purchases;
  DELETE FROM public.vaults;
  DELETE FROM public.vendors;
  DELETE FROM public.restaurants;
  DELETE FROM public.activity_log;
END;
$$;