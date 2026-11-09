export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { sweepAttachments } = await import("@/lib/attachments/store");
  const run = () => {
    try {
      sweepAttachments();
    } catch (error) {
      console.error("Attachment cleanup failed", error);
    }
  };
  setTimeout(run, 60 * 1000).unref();
  setInterval(run, 60 * 60 * 1000).unref();
}
