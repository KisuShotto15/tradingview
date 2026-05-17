"use client";

import { AuthProvider } from "@/lib/supabase/auth-context";
import { useCloudSync } from "@/lib/supabase/use-cloud-sync";
import { useDrawingsSync } from "@/lib/supabase/use-drawings-sync";
import { TooltipProvider } from "@/components/ui/tooltip";

function CloudSyncInner({ children }: { children: React.ReactNode }) {
  useCloudSync();
  useDrawingsSync();
  return <>{children}</>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <TooltipProvider delay={150}>
        <CloudSyncInner>{children}</CloudSyncInner>
      </TooltipProvider>
    </AuthProvider>
  );
}
