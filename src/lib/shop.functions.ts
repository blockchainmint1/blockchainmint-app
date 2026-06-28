import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listProducts = createServerFn({ method: "GET" }).handler(async () => {
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await supabase
    .from("products")
    .select("id,slug,name,chain,denomination,metal,price_cents,currency,description,image_url,in_stock")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const getProduct = createServerFn({ method: "POST" })
  .inputValidator((input: { slug: string }) =>
    z.object({ slug: z.string().min(1).max(80) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
    );
    const { data: row, error } = await supabase
      .from("products")
      .select("id,slug,name,chain,denomination,metal,price_cents,currency,description,image_url,in_stock")
      .eq("slug", data.slug)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

export const createOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { product_id: string; quantity: number }) =>
    z.object({ product_id: z.string().uuid(), quantity: z.number().int().min(1).max(50) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: product, error: pErr } = await context.supabase
      .from("products")
      .select("id,price_cents,currency,in_stock")
      .eq("id", data.product_id)
      .single();
    if (pErr) throw new Error(pErr.message);
    if (!product.in_stock) throw new Error("Out of stock");
    const { data: order, error } = await context.supabase
      .from("orders")
      .insert({
        user_id: context.userId,
        product_id: product.id,
        quantity: data.quantity,
        total_cents: product.price_cents * data.quantity,
        currency: product.currency,
        status: "pending",
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return order;
  });
