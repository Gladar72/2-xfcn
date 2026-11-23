const { setTimeout: delay } = require("node:timers/promises");
async function run() {
  for (;;) {
    try {
      const response = await fetch("http://app:3000/api/cron/ticket-refunds", {
        headers: { Authorization: "Bearer " + process.env.CRON_SECRET },
        signal: AbortSignal.timeout(90_000),
      });
      if (!response.ok) console.error("Refund worker returned", response.status);
    } catch {
      console.error("Refund worker could not reach the sandbox");
    }
    await delay(60_000);
  }
}
run();
