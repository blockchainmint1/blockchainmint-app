import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";
import { TabBar } from "@/components/TabBar";
import { Splash } from "@/components/Splash";
import { LegacyImportPrompt } from "@/components/LegacyImportPrompt";
import { useAlertsAutoSync } from "@/lib/alertsSync";
import { registerForPush } from "@/lib/push";
import { enablePrivacyScreen } from "@/lib/nativeSecurity";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  useAlertsAutoSync();
  useEffect(() => {
    void registerForPush();
    void enablePrivacyScreen();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Splash />
      <LegacyImportPrompt />
      <div className="mx-auto max-w-md pb-24">
        <Outlet />
      </div>
      <TabBar />
    </div>
  );
}
