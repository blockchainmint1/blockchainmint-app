DROP TRIGGER IF EXISTS enforce_order_price_trg ON public.orders;
CREATE TRIGGER enforce_order_price_trg
BEFORE INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.enforce_order_price();

DROP TRIGGER IF EXISTS enforce_order_price_upd_trg ON public.orders;
CREATE TRIGGER enforce_order_price_upd_trg
BEFORE UPDATE OF product_id, quantity, total_cents, currency ON public.orders
FOR EACH ROW
WHEN (
  NEW.product_id IS DISTINCT FROM OLD.product_id
  OR NEW.quantity IS DISTINCT FROM OLD.quantity
  OR NEW.total_cents IS DISTINCT FROM OLD.total_cents
  OR NEW.currency IS DISTINCT FROM OLD.currency
)
EXECUTE FUNCTION public.enforce_order_price();

DROP TRIGGER IF EXISTS orders_set_updated_at ON public.orders;
CREATE TRIGGER orders_set_updated_at
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();