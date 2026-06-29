
-- 1. Store a fresh cron secret in Vault (idempotent)
DO $$
DECLARE
  v_secret text;
  v_existing uuid;
BEGIN
  SELECT id INTO v_existing FROM vault.secrets WHERE name = 'cron_webhook_secret';
  IF v_existing IS NULL THEN
    v_secret := encode(gen_random_bytes(32), 'hex');
    PERFORM vault.create_secret(v_secret, 'cron_webhook_secret', 'Shared secret for /api/public/hooks/watch-tick');
  END IF;
END $$;

-- 2. Security-definer accessor so service_role server code can read the value
CREATE OR REPLACE FUNCTION public.get_cron_webhook_secret()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_webhook_secret' LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_cron_webhook_secret() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_cron_webhook_secret() TO service_role;

-- 3. Reschedule the cron job with x-cron-secret header (drops the public anon-key auth)
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE command ILIKE '%/api/public/hooks/watch-tick%';

SELECT cron.schedule(
  'watch-tick',
  '*/15 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://project--ec19e94e-4275-471e-a50b-28c742ea3b10.lovable.app/api/public/hooks/watch-tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_webhook_secret' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $cron$
);
