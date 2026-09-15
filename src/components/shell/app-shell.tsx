"use client";

import { useEffect, useState } from "react";
import { CommandPalette } from "@/components/shell/command-palette";
import { NavRail } from "@/components/shell/nav-rail";
import { Topbar, type SessionUser } from "@/components/shell/topbar";

export function AppShell({
  user,
  demoMode,
  liveEnabled,
  blobEnabled,
  children,
}: {
  user: SessionUser;
  demoMode: boolean;
  liveEnabled: boolean;
  blobEnabled: boolean;
  children: React.ReactNode;
}) {
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden">
      <NavRail />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          user={user}
          demoMode={demoMode}
          liveEnabled={liveEnabled}
          blobEnabled={blobEnabled}
          onOpenSearch={() => setPaletteOpen(true)}
        />
        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
