ALTER TABLE public.verification_records ADD COLUMN IF NOT EXISTS asset_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS verification_records_asset_id_key ON public.verification_records (upper(asset_id)) WHERE asset_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS verification_records_chain_address_key ON public.verification_records (chain, address);
GRANT SELECT ON public.verification_records TO anon, authenticated;
GRANT ALL ON public.verification_records TO service_role;