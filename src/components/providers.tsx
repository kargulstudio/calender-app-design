"use client";

import { ThemeProvider } from "next-themes";
import { useEffect } from "react";
import { GoogleSync } from "@/components/google-sync";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useIsMobile } from "@/hooks/use-media-query";
import { useAppStore } from "@/stores/app-store";

/** Loads persisted data once the client has hydrated the seed markup. */
function StoreHydrator() {
  useEffect(() => {
    void useAppStore.persist.rehydrate();
  }, []);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  // Phones: toasts drop from the top so they never cover bottom bars and sheets.
  const isMobile = useIsMobile();
  return (
    <ThemeProvider attribute="data-theme" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
      <TooltipProvider delayDuration={400} skipDelayDuration={300}>
        <StoreHydrator />
        <GoogleSync />
        {children}
        <Toaster position={isMobile ? "top-center" : "bottom-right"} />
      </TooltipProvider>
    </ThemeProvider>
  );
}
