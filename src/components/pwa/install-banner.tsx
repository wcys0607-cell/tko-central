"use client";

import { usePWAInstall } from "@/hooks/use-pwa-install";
import { Button } from "@/components/ui/button";
import { Download, X, Share } from "lucide-react";

export function InstallBanner() {
  const { showBanner, isIOS, install, dismiss } = usePWAInstall();

  if (!showBanner) return null;

  return (
    <div className="fixed bottom-20 md:bottom-4 left-4 right-4 z-50 mx-auto max-w-md animate-in slide-in-from-bottom-4 duration-300">
      <div className="flex items-center gap-3 rounded-lg border bg-background p-3 shadow-lg">
        <Download className="h-5 w-5 shrink-0 text-primary" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Install TKO Hub</p>
          {isIOS ? (
            <p className="text-xs text-muted-foreground">
              Tap <Share className="inline h-3 w-3 -mt-0.5" /> then &quot;Add to Home Screen&quot;
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Add to your home screen for quick access
            </p>
          )}
        </div>
        {!isIOS && (
          <Button size="sm" className="h-8 text-xs" onClick={install}>
            Install
          </Button>
        )}
        <button
          onClick={dismiss}
          className="shrink-0 rounded-md p-1 hover:bg-muted"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
    </div>
  );
}
