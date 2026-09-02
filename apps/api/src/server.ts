import "dotenv/config";

import { buildApp } from "./app.js";

async function start(): Promise<void> {
  const app = await buildApp();
  let shuttingDown = false;

  async function shutdown(signal: string, exitCode = 0): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ signal }, "Shutting down ExtraOK API");

    const forceExit = setTimeout(() => {
      app.log.fatal("Graceful shutdown timed out");
      process.exit(1);
    }, 10_000);
    forceExit.unref();

    try {
      await app.close();
      clearTimeout(forceExit);
      process.exitCode = exitCode;
    } catch (error) {
      app.log.error({ err: error }, "Failed to shut down cleanly");
      process.exitCode = 1;
    }
  }

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("uncaughtException", (error) => {
    app.log.fatal({ err: error }, "Uncaught exception");
    void shutdown("uncaughtException", 1);
  });
  process.once("unhandledRejection", (error) => {
    app.log.fatal({ err: error }, "Unhandled rejection");
    void shutdown("unhandledRejection", 1);
  });

  await app.listen({ host: app.env.HOST, port: app.env.PORT });
}

start().catch((error: unknown) => {
  console.error("Unable to start ExtraOK API", error);
  process.exitCode = 1;
});
