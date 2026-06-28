import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getProduct, createOrder } from "@/lib/shop.functions";
import { CoinMedallion } from "@/components/CoinMedallion";
import { CHAINS, type ChainId } from "@/lib/chains";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/shop/$slug")({
  head: () => ({ meta: [{ title: "Coin — Blockchain Mint Shop" }] }),
  component: ProductPage,
});

function ProductPage() {
  const { slug } = useParams({ from: "/_app/shop/$slug" });
  const navigate = useNavigate();
  const fetchProduct = useServerFn(getProduct);
  const orderFn = useServerFn(createOrder);

  const { data: product, isLoading } = useQuery({
    queryKey: ["product", slug],
    queryFn: () => fetchProduct({ data: { slug } }),
  });

  const order = useMutation({
    mutationFn: () => orderFn({ data: { product_id: product!.id, quantity: 1 } }),
    onSuccess: () => {
      toast.success("Order placed. Checkout via honest.money payment rail coming in Phase 5.");
      navigate({ to: "/shop" });
    },
    onError: e => toast.error((e as Error).message),
  });

  if (isLoading) return <div className="px-5 pt-10"><div className="h-64 animate-pulse rounded-xl bg-card" /></div>;
  if (!product) return <div className="px-5 pt-10">Not found.</div>;

  return (
    <div className="px-5 pt-6">
      <Link to="/shop" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Shop
      </Link>
      <div className="mt-6 flex flex-col items-center">
        <CoinMedallion chain={product.chain as ChainId} size={180} />
        <h1 className="mt-6 text-center font-serif text-3xl text-foreground">{product.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{product.denomination} · {product.metal} · {CHAINS[product.chain as ChainId].name}</p>
        <p className="mt-4 num font-mono text-2xl text-primary">${(product.price_cents/100).toFixed(2)}</p>
      </div>

      {product.description && <p className="mt-6 text-sm leading-relaxed text-muted-foreground">{product.description}</p>}

      <button
        disabled={!product.in_stock || order.isPending}
        onClick={() => order.mutate()}
        className="mt-6 w-full rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {product.in_stock ? (order.isPending ? "Placing order…" : "Order one") : "Sold out"}
      </button>

      <p className="mt-3 text-center text-[11px] text-muted-foreground">
        Checkout via honest.money payment rail — final integration lands in Phase 5.
      </p>
    </div>
  );
}
