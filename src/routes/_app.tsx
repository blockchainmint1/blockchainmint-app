import { createFileRoute, Outlet } from "@tanstack/react-router";
import { TabBar } from "@/components/TabBar";
import { Splash } from "@/components/Splash";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  return (
    <div className="min-h-screen bg-background">
      <Splash />
      <div className="mx-auto max-w-md pb-24">
        <Outlet />
      </div>
      <TabBar />
    </div>
  );
}
