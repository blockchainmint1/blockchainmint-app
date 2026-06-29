
-- Restrictive INSERT policy: customers can only create orders in 'pending' status
CREATE POLICY "orders insert must be pending"
  ON public.orders AS RESTRICTIVE FOR INSERT
  TO authenticated
  WITH CHECK (status = 'pending');

-- Trigger function: recompute total_cents and currency from products table on insert
CREATE OR REPLACE FUNCTION public.enforce_order_price()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p_price INT;
  p_currency TEXT;
BEGIN
  -- Skip enforcement for service_role (server-side / webhook writes)
  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  SELECT price_cents, currency INTO p_price, p_currency
  FROM public.products WHERE id = NEW.product_id;

  IF p_price IS NULL THEN
    RAISE EXCEPTION 'Unknown product %', NEW.product_id;
  END IF;

  IF NEW.quantity IS NULL OR NEW.quantity < 1 THEN
    NEW.quantity := 1;
  END IF;

  NEW.total_cents := p_price * NEW.quantity;
  NEW.currency := p_currency;
  NEW.status := 'pending';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_order_price_trg ON public.orders;
CREATE TRIGGER enforce_order_price_trg
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.enforce_order_price();
