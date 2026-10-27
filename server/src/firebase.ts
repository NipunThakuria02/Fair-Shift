import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
function getCredential() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const parsed = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      return cert(parsed);
    } catch {
      // fallback
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
