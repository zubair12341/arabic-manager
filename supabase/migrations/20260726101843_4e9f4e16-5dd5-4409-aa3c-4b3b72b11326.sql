
-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'staff');
CREATE TYPE public.payment_type AS ENUM ('cash', 'credit', 'partial');

-- ============ UPDATED_AT HELPER ============
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  email TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "self update profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read roles" ON public.user_roles FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

CREATE POLICY "admins manage roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ RESTAURANTS ============
CREATE TABLE public.restaurants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  opening_cash_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurants TO authenticated;
GRANT ALL ON public.restaurants TO service_role;
ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all restaurants" ON public.restaurants FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER restaurants_updated_at BEFORE UPDATE ON public.restaurants FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ VENDORS ============
CREATE TABLE public.vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  current_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX vendors_restaurant_idx ON public.vendors(restaurant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendors TO authenticated;
GRANT ALL ON public.vendors TO service_role;
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all vendors" ON public.vendors FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER vendors_updated_at BEFORE UPDATE ON public.vendors FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Initialize current_balance from opening_balance on insert
CREATE OR REPLACE FUNCTION public.tg_vendors_init_balance()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.current_balance = COALESCE(NEW.opening_balance, 0);
  RETURN NEW;
END; $$;
CREATE TRIGGER vendors_init_balance BEFORE INSERT ON public.vendors
  FOR EACH ROW EXECUTE FUNCTION public.tg_vendors_init_balance();

-- If opening_balance changes on update, adjust current_balance by the delta
CREATE OR REPLACE FUNCTION public.tg_vendors_adjust_opening()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.opening_balance <> OLD.opening_balance THEN
    NEW.current_balance = OLD.current_balance + (NEW.opening_balance - OLD.opening_balance);
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER vendors_adjust_opening BEFORE UPDATE ON public.vendors
  FOR EACH ROW EXECUTE FUNCTION public.tg_vendors_adjust_opening();

-- ============ VAULTS ============
CREATE TABLE public.vaults (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,
  vault_user_name TEXT NOT NULL,
  opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  current_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX vaults_restaurant_idx ON public.vaults(restaurant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vaults TO authenticated;
GRANT ALL ON public.vaults TO service_role;
ALTER TABLE public.vaults ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all vaults" ON public.vaults FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER vaults_updated_at BEFORE UPDATE ON public.vaults FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE OR REPLACE FUNCTION public.tg_vaults_init_balance()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.current_balance = COALESCE(NEW.opening_balance, 0);
  RETURN NEW;
END; $$;
CREATE TRIGGER vaults_init_balance BEFORE INSERT ON public.vaults
  FOR EACH ROW EXECUTE FUNCTION public.tg_vaults_init_balance();

CREATE OR REPLACE FUNCTION public.tg_vaults_adjust_opening()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.opening_balance <> OLD.opening_balance THEN
    NEW.current_balance = OLD.current_balance + (NEW.opening_balance - OLD.opening_balance);
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER vaults_adjust_opening BEFORE UPDATE ON public.vaults
  FOR EACH ROW EXECUTE FUNCTION public.tg_vaults_adjust_opening();

-- ============ PURCHASES ============
CREATE TABLE public.purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,
  vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE RESTRICT,
  vault_id UUID REFERENCES public.vaults(id) ON DELETE RESTRICT,
  amount NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
  payment_type public.payment_type NOT NULL,
  amount_paid_now NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (amount_paid_now >= 0),
  details TEXT,
  invoice_images TEXT[] NOT NULL DEFAULT '{}',
  purchase_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX purchases_vendor_idx ON public.purchases(vendor_id) WHERE is_deleted = false;
CREATE INDEX purchases_restaurant_idx ON public.purchases(restaurant_id) WHERE is_deleted = false;
CREATE INDEX purchases_vault_idx ON public.purchases(vault_id) WHERE is_deleted = false;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchases TO authenticated;
GRANT ALL ON public.purchases TO service_role;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all purchases" ON public.purchases FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER purchases_updated_at BEFORE UPDATE ON public.purchases FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ PAYMENTS ============
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,
  vault_id UUID NOT NULL REFERENCES public.vaults(id) ON DELETE RESTRICT,
  vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE RESTRICT,
  amount NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
  note TEXT,
  payment_images TEXT[] NOT NULL DEFAULT '{}',
  payment_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX payments_vendor_idx ON public.payments(vendor_id) WHERE is_deleted = false;
CREATE INDEX payments_vault_idx ON public.payments(vault_id) WHERE is_deleted = false;
CREATE INDEX payments_restaurant_idx ON public.payments(restaurant_id) WHERE is_deleted = false;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all payments" ON public.payments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER payments_updated_at BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ BALANCE TRIGGERS ============
-- Credit portion of a purchase (what the vendor is owed)
CREATE OR REPLACE FUNCTION public.purchase_credit_portion(_type public.payment_type, _amount NUMERIC, _paid NUMERIC)
RETURNS NUMERIC LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _type
    WHEN 'credit' THEN _amount
    WHEN 'cash' THEN 0
    WHEN 'partial' THEN GREATEST(_amount - _paid, 0)
  END
$$;

-- Purchases: vendor.current_balance += credit_portion delta, vault.current_balance -= amount_paid_now delta
CREATE OR REPLACE FUNCTION public.tg_purchases_balance()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  old_credit NUMERIC := 0; old_paid NUMERIC := 0; old_vendor UUID; old_vault UUID;
  new_credit NUMERIC := 0; new_paid NUMERIC := 0; new_vendor UUID; new_vault UUID;
  old_active BOOLEAN := false; new_active BOOLEAN := false;
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    old_active := NOT OLD.is_deleted;
    IF old_active THEN
      old_credit := public.purchase_credit_portion(OLD.payment_type, OLD.amount, OLD.amount_paid_now);
      old_paid := OLD.amount_paid_now;
      old_vendor := OLD.vendor_id; old_vault := OLD.vault_id;
    END IF;
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN
    new_active := NOT NEW.is_deleted;
    IF new_active THEN
      new_credit := public.purchase_credit_portion(NEW.payment_type, NEW.amount, NEW.amount_paid_now);
      new_paid := NEW.amount_paid_now;
      new_vendor := NEW.vendor_id; new_vault := NEW.vault_id;
    END IF;
  END IF;

  -- Reverse old
  IF old_active THEN
    UPDATE public.vendors SET current_balance = current_balance - old_credit WHERE id = old_vendor;
    IF old_vault IS NOT NULL AND old_paid > 0 THEN
      UPDATE public.vaults SET current_balance = current_balance + old_paid WHERE id = old_vault;
    END IF;
  END IF;
  -- Apply new
  IF new_active THEN
    UPDATE public.vendors SET current_balance = current_balance + new_credit WHERE id = new_vendor;
    IF new_vault IS NOT NULL AND new_paid > 0 THEN
      UPDATE public.vaults SET current_balance = current_balance - new_paid WHERE id = new_vault;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;
CREATE TRIGGER purchases_balance_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.purchases
  FOR EACH ROW EXECUTE FUNCTION public.tg_purchases_balance();

-- Payments: vendor.current_balance -= amount delta, vault.current_balance -= amount delta
CREATE OR REPLACE FUNCTION public.tg_payments_balance()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  old_amt NUMERIC := 0; old_vendor UUID; old_vault UUID;
  new_amt NUMERIC := 0; new_vendor UUID; new_vault UUID;
  old_active BOOLEAN := false; new_active BOOLEAN := false;
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    old_active := NOT OLD.is_deleted;
    IF old_active THEN
      old_amt := OLD.amount; old_vendor := OLD.vendor_id; old_vault := OLD.vault_id;
    END IF;
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN
    new_active := NOT NEW.is_deleted;
    IF new_active THEN
      new_amt := NEW.amount; new_vendor := NEW.vendor_id; new_vault := NEW.vault_id;
    END IF;
  END IF;

  IF old_active THEN
    UPDATE public.vendors SET current_balance = current_balance + old_amt WHERE id = old_vendor;
    UPDATE public.vaults SET current_balance = current_balance + old_amt WHERE id = old_vault;
  END IF;
  IF new_active THEN
    UPDATE public.vendors SET current_balance = current_balance - new_amt WHERE id = new_vendor;
    UPDATE public.vaults SET current_balance = current_balance - new_amt WHERE id = new_vault;
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;
CREATE TRIGGER payments_balance_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.tg_payments_balance();

-- ============ DELETE GUARDS ============
CREATE OR REPLACE FUNCTION public.tg_guard_restaurant_delete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.purchases WHERE restaurant_id = OLD.id)
     OR EXISTS (SELECT 1 FROM public.payments WHERE restaurant_id = OLD.id)
     OR EXISTS (SELECT 1 FROM public.vendors WHERE restaurant_id = OLD.id)
     OR EXISTS (SELECT 1 FROM public.vaults WHERE restaurant_id = OLD.id) THEN
    RAISE EXCEPTION 'Cannot delete restaurant with existing vendors, vaults, or transactions. Deactivate instead.' USING ERRCODE = 'P0001';
  END IF;
  RETURN OLD;
END; $$;
CREATE TRIGGER restaurants_delete_guard BEFORE DELETE ON public.restaurants
  FOR EACH ROW EXECUTE FUNCTION public.tg_guard_restaurant_delete();

CREATE OR REPLACE FUNCTION public.tg_guard_vendor_delete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.purchases WHERE vendor_id = OLD.id)
     OR EXISTS (SELECT 1 FROM public.payments WHERE vendor_id = OLD.id)
     OR OLD.current_balance <> 0 THEN
    RAISE EXCEPTION 'Cannot delete vendor with transactions or a non-zero balance. Deactivate instead.' USING ERRCODE = 'P0001';
  END IF;
  RETURN OLD;
END; $$;
CREATE TRIGGER vendors_delete_guard BEFORE DELETE ON public.vendors
  FOR EACH ROW EXECUTE FUNCTION public.tg_guard_vendor_delete();

CREATE OR REPLACE FUNCTION public.tg_guard_vault_delete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.purchases WHERE vault_id = OLD.id)
     OR EXISTS (SELECT 1 FROM public.payments WHERE vault_id = OLD.id)
     OR OLD.current_balance <> OLD.opening_balance THEN
    RAISE EXCEPTION 'Cannot delete vault with transactions or a changed balance. Deactivate instead.' USING ERRCODE = 'P0001';
  END IF;
  RETURN OLD;
END; $$;
CREATE TRIGGER vaults_delete_guard BEFORE DELETE ON public.vaults
  FOR EACH ROW EXECUTE FUNCTION public.tg_guard_vault_delete();

-- ============ ACTIVITY LOG ============
CREATE TABLE public.activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES auth.users(id),
  actor_email TEXT,
  entity TEXT NOT NULL,
  entity_id UUID,
  action TEXT NOT NULL,
  before JSONB,
  after JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX activity_log_created_idx ON public.activity_log(created_at DESC);
GRANT SELECT, INSERT ON public.activity_log TO authenticated;
GRANT ALL ON public.activity_log TO service_role;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read log" ON public.activity_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert log" ON public.activity_log FOR INSERT TO authenticated WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.tg_log_activity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _actor UUID := auth.uid();
  _email TEXT;
  _action TEXT := TG_OP;
  _before JSONB; _after JSONB; _entity_id UUID;
BEGIN
  SELECT email INTO _email FROM public.profiles WHERE id = _actor;
  IF TG_OP = 'INSERT' THEN
    _after := to_jsonb(NEW); _entity_id := NEW.id;
  ELSIF TG_OP = 'UPDATE' THEN
    _before := to_jsonb(OLD); _after := to_jsonb(NEW); _entity_id := NEW.id;
  ELSE
    _before := to_jsonb(OLD); _entity_id := OLD.id;
  END IF;
  INSERT INTO public.activity_log(actor_id, actor_email, entity, entity_id, action, before, after)
  VALUES (_actor, _email, TG_TABLE_NAME, _entity_id, _action, _before, _after);
  RETURN COALESCE(NEW, OLD);
END; $$;

CREATE TRIGGER log_restaurants AFTER INSERT OR UPDATE OR DELETE ON public.restaurants FOR EACH ROW EXECUTE FUNCTION public.tg_log_activity();
CREATE TRIGGER log_vendors AFTER INSERT OR UPDATE OR DELETE ON public.vendors FOR EACH ROW EXECUTE FUNCTION public.tg_log_activity();
CREATE TRIGGER log_vaults AFTER INSERT OR UPDATE OR DELETE ON public.vaults FOR EACH ROW EXECUTE FUNCTION public.tg_log_activity();
CREATE TRIGGER log_purchases AFTER INSERT OR UPDATE OR DELETE ON public.purchases FOR EACH ROW EXECUTE FUNCTION public.tg_log_activity();
CREATE TRIGGER log_payments AFTER INSERT OR UPDATE OR DELETE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.tg_log_activity();

-- ============ APP SETTINGS (single row) ============
CREATE TABLE public.app_settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  business_name TEXT NOT NULL DEFAULT 'My Restaurant Group',
  currency_symbol TEXT NOT NULL DEFAULT '$',
  currency_code TEXT NOT NULL DEFAULT 'USD',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.app_settings (id) VALUES (1);
GRANT SELECT ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read settings" ON public.app_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin update settings" ON public.app_settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER app_settings_updated_at BEFORE UPDATE ON public.app_settings FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ VENDOR LEDGER VIEW ============
CREATE OR REPLACE VIEW public.vendor_ledger_entries AS
  SELECT
    v.id AS vendor_id, v.restaurant_id,
    v.created_at AS entry_date,
    'opening' AS entry_type,
    NULL::UUID AS ref_id,
    'Opening Balance' AS description,
    GREATEST(v.opening_balance, 0) AS debit,
    GREATEST(-v.opening_balance, 0) AS credit,
    0 AS sort_order
  FROM public.vendors v
  UNION ALL
  SELECT
    p.vendor_id, p.restaurant_id,
    p.purchase_date AS entry_date,
    'purchase' AS entry_type,
    p.id AS ref_id,
    CASE p.payment_type
      WHEN 'credit' THEN 'Purchase (credit)'
      WHEN 'partial' THEN 'Purchase (partial credit)'
      ELSE 'Purchase' END || COALESCE(' — ' || NULLIF(p.details, ''), '') AS description,
    public.purchase_credit_portion(p.payment_type, p.amount, p.amount_paid_now) AS debit,
    0::NUMERIC AS credit,
    1 AS sort_order
  FROM public.purchases p
  WHERE p.is_deleted = false
    AND public.purchase_credit_portion(p.payment_type, p.amount, p.amount_paid_now) > 0
  UNION ALL
  SELECT
    pm.vendor_id, pm.restaurant_id,
    pm.payment_date AS entry_date,
    'payment' AS entry_type,
    pm.id AS ref_id,
    'Payment' || COALESCE(' — ' || NULLIF(pm.note, ''), '') AS description,
    0::NUMERIC AS debit,
    pm.amount AS credit,
    2 AS sort_order
  FROM public.payments pm
  WHERE pm.is_deleted = false;

GRANT SELECT ON public.vendor_ledger_entries TO authenticated;

-- ============ RESTAURANT REPORT FUNCTION ============
CREATE OR REPLACE FUNCTION public.restaurant_vendor_report(
  _restaurant_id UUID,
  _from TIMESTAMPTZ DEFAULT NULL,
  _to TIMESTAMPTZ DEFAULT NULL
) RETURNS TABLE (
  vendor_id UUID,
  vendor_name TEXT,
  opening_balance NUMERIC,
  total_purchased NUMERIC,
  total_paid NUMERIC,
  current_balance NUMERIC,
  total NUMERIC
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    v.id,
    v.name,
    v.opening_balance,
    COALESCE((SELECT SUM(p.amount) FROM public.purchases p
              WHERE p.vendor_id = v.id AND p.is_deleted = false
                AND (_from IS NULL OR p.purchase_date >= _from)
                AND (_to IS NULL OR p.purchase_date <= _to)), 0) AS total_purchased,
    COALESCE((SELECT SUM(pm.amount) FROM public.payments pm
              WHERE pm.vendor_id = v.id AND pm.is_deleted = false
                AND (_from IS NULL OR pm.payment_date >= _from)
                AND (_to IS NULL OR pm.payment_date <= _to)), 0) AS total_paid,
    v.current_balance,
    (v.opening_balance + v.current_balance) AS total
  FROM public.vendors v
  WHERE v.restaurant_id = _restaurant_id
  ORDER BY v.name
$$;
GRANT EXECUTE ON FUNCTION public.restaurant_vendor_report(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
