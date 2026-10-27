import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
function getCredential() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      let raw = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
      if (!raw.startsWith("{")) {
        try {
          raw = Buffer.from(raw, "base64").toString("utf8");
        } catch {
          // keep raw
        }
      }
      const parsed = JSON.parse(raw);
      if (parsed.private_key && typeof parsed.private_key === "string") {
        parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
      }
      return cert(parsed);
    } catch (err) {
      console.error("Failed to initialize Firebase credentials from FIREBASE_SERVICE_ACCOUNT:", err);
    }
  }
  return applicationDefault();
}
export function firebase() {
  if (
    process.env.K_SERVICE &&
    (process.env.FIRESTORE_EMULATOR_HOST ||
      process.env.FIREBASE_AUTH_EMULATOR_HOST)
  )
    throw new Error("Emulators cannot be used in Cloud Run.");
  if (
    process.env.NODE_ENV === "production" &&
    (process.env.FIRESTORE_EMULATOR_HOST ||
      process.env.FIREBASE_AUTH_EMULATOR_HOST)
  )
    throw new Error("Emulators cannot be used in production.");
  const projectId =
    process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
  const app =
    getApps()[0] ||
    initializeApp({
      ...(projectId ? { projectId } : {}),
      ...(process.env.FIREBASE_AUTH_EMULATOR_HOST
        ? {}
        : { credential: getCredential() }),
    });
  return { auth: getAuth(app), db: getFirestore(app) };
}
