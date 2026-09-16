import type { Metadata } from "next";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/primitives";
import "./globals.css";

export const metadata: Metadata = {
  title: "FireflyX — AI Meeting Notes",
  description:
    "Record, transcribe, summarize and search your meetings. A working clone of Fireflies.ai.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              borderRadius: "10px",
              border: "1px solid var(--color-line)",
              fontSize: "13px",
            },
          }}
        />
      </body>
    </html>
  );
}
