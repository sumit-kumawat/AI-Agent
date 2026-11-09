export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { runRenewals } = await import("@/lib/billing/store");
  const tick = () => {
    try {
      const result = runRenewals();
      if (result.issued || result.ended) console.info("[billing] renewals", result);
    } catch (error) {
      console.error("[billing] renewals failed", error instanceof Error ? error.message : error);
    }
  };
  setTimeout(tick, 30_000).unref();
  setInterval(tick, 60 * 60 * 1000).unref();
}
