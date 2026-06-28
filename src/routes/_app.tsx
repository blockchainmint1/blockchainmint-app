import { createFileRoute, Outlet, Navigate } from "@tanstack/react-router";
import { TabBar } from "@/components/TabBar";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const { ready, user } = useAuth();
  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="medallion-gold size-16 animate-pulse rounded-full" aria-label="Loading" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" search={{ mode: "signin" }} />;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-md pb-24">
        <Outlet />
      </div>
      <TabBar />
    </div>
  );
}
