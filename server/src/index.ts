import { createApp } from "./app.js";
if (
  (process.env.NODE_ENV === "production" || process.env.K_SERVICE) &&
  (process.env.FIREBASE_AUTH_EMULATOR_HOST ||
    process.env.FIRESTORE_EMULATOR_HOST)
) {
  throw new Error("Firebase emulators cannot be used in production.");
}
const port = Number(process.env.PORT || 8080);
const server = createApp().listen(port, "0.0.0.0", () =>
  console.info(JSON.stringify({ event: "server_started", port })),
);
server.requestTimeout = 30_000;
server.headersTimeout = 35_000;
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => server.close(() => process.exit(0)));
