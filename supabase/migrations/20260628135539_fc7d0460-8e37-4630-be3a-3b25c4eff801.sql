
-- devices: anonymous per-installation identity
CREATE TABLE public.devices (
  device_id uuid PRIMARY KEY,
  push_token text,
  push_platform text CHECK (push_platform IN ('ios','android','web')),
  app_version text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.devices TO service_role;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
-- No policies = locked down to service_role only.

-- device_watched: addresses being watched per device, with embedded alert rules
CREATE TABLE public.device_watched (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES public.devices(device_id) ON DELETE CASCADE,
  chain text NOT NULL,
  address text NOT NULL,
  nickname text,
  incoming_enabled boolean NOT NULL DEFAULT true,
  balance_above numeric,
  balance_below numeric,
  price_above numeric,
  price_below numeric,
  last_balance numeric NOT NULL DEFAULT 0,
  last_tx_hash text,
  last_price_at_set numeric,
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (device_id, chain, address)
);
CREATE INDEX device_watched_chain_idx ON public.device_watched (chain);
GRANT ALL ON public.device_watched TO service_role;
ALTER TABLE public.device_watched ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER device_watched_updated_at
  BEFORE UPDATE ON public.device_watched
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- device_alerts: historical inbox
CREATE TABLE public.device_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES public.devices(device_id) ON DELETE CASCADE,
  chain text NOT NULL,
  address text NOT NULL,
  kind text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  payload jsonb,
  tx_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);
CREATE INDEX device_alerts_device_created_idx ON public.device_alerts (device_id, created_at DESC);
GRANT ALL ON public.device_alerts TO service_role;
ALTER TABLE public.device_alerts ENABLE ROW LEVEL SECURITY;

-- chain_price_state: one row per chain, for diffing price thresholds
CREATE TABLE public.chain_price_state (
  chain text PRIMARY KEY,
  last_price numeric,
  last_checked_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.chain_price_state TO service_role;
ALTER TABLE public.chain_price_state ENABLE ROW LEVEL SECURITY;
