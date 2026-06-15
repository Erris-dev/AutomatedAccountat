import { buildApp } from "./app";
import { config } from "./config/env";

const app = buildApp();

const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
  app.log.info({ signal }, "Shutting down server");

  try {
    await app.close();
    process.exitCode = 0;
  } catch (error) {
    app.log.error(error, "Failed to shut down server cleanly");
    process.exitCode = 1;
  }
};

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

const start = async (): Promise<void> => {
  try {
    await app.listen({
      host: "0.0.0.0",
      port: config.server.port,
    });
  } catch (error) {
    app.log.error(error, "Failed to start server");
    process.exitCode = 1;
  }
};

void start();
