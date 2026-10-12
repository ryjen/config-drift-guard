import { buildApp } from "../apps/api/dist/app.js";

const app = await buildApp();

process.once("SIGTERM", () => {
  void app.close().then(
    () => process.exit(0),
    () => process.exit(1),
  );
});

try {
  // A readiness message can only come from this child after it owns the port.
  await app.listen({ host: "127.0.0.1", port: 4000 });
  if (process.send === undefined) {
    throw new Error("E2E API must be started with an IPC channel");
  }
  process.send({ type: "ready" });
} catch (error) {
  console.error("E2E API startup failed", error);
  await app.close();
  process.exitCode = 1;
}
