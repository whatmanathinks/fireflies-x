export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV === "production") return;
  if (process.env.DISABLE_DEV_WORKER === "1") return;

  const { runDueJobs } = await import("@/lib/jobs");

  let running = false;
  setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const results = await runDueJobs(4);
      for (const r of results) {
        if (!r.ok) console.warn(`[worker] ${r.step} failed: ${r.error}`);
      }
    } catch (error) {
      console.warn("[worker]", error instanceof Error ? error.message : error);
    } finally {
      running = false;
    }
  }, 3000);

  console.log("[worker] dev job runner started (3s tick)");
}
