import { spawn } from "node:child_process";
// Explicit local workflow only. The production server independently rejects emulator use.
const child = spawn("npm", ["run", "dev"], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: {
    ...process.env,
    NODE_ENV: "development",
    GCLOUD_PROJECT: "demo-fairshift",
    FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
    FIRESTORE_EMULATOR_HOST: "127.0.0.1:8085",
    VITE_FIREBASE_API_KEY: "local-emulator-only",
    VITE_FIREBASE_AUTH_DOMAIN: "demo-fairshift.firebaseapp.com",
    VITE_FIREBASE_PROJECT_ID: "demo-fairshift",
    VITE_FIREBASE_APP_ID: "demo-fairshift-local",
    VITE_USE_EMULATORS: "true",
  },
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => child.kill(signal));
