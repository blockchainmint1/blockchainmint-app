import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";
import { TabBar } from "@/components/TabBar";
import { Splash } from "@/components/Splash";
import { useAlertsAutoSync } from "@/lib/alertsSync";
import { registerForPush } from "@/lib/push";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  useAlertsAutoSync();
  useEffect(() => { void registerForPush(); }, []);

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
