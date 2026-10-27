import { spawn } from "node:child_process";
import { resolve } from "node:path";
const command =
  process.argv[2] === "test"
    ? [
        "emulators:exec",
        "--only",
        "auth,firestore",
        "--project",
        "demo-fairshift",
        "tsx scripts/integration.ts",
      ]
    : [
        "emulators:start",
        "--only",
        "auth,firestore",
        "--project",
        "demo-fairshift",
      ];
const localJdk = resolve(".local/jdk-21");
const jdkBin = resolve(".local/jdk-21/bin");
const pathDelimiter = process.platform === "win32" ? ";" : ":";
const child = spawn("firebase", command, {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: {
    ...process.env,
    JAVA_HOME: process.env.JAVA_HOME || localJdk,
    PATH: `${jdkBin}${pathDelimiter}${process.env.PATH || ""}`,
    XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME || resolve(".local/config"),
    FIREBASE_EMULATORS_PATH:
      process.env.FIREBASE_EMULATORS_PATH || resolve(".local/emulators"),
  },
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => child.kill(signal));
