import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};
export const configured = Object.values(config).every(
  (v) => typeof v === "string" && v.length > 0 && !v.startsWith("replace_with"),
);
export const auth = configured ? getAuth(initializeApp(config)) : null;
export const usingEmulators =
  import.meta.env.VITE_USE_EMULATORS === "true" &&
  ["localhost", "127.0.0.1"].includes(window.location.hostname);
if (auth && usingEmulators)
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
export async function api<T>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  if (!auth?.currentUser)
    throw new Error("Please sign in again. / மீண்டும் உள்நுழையவும்.");
  const token = await auth.currentUser.getIdToken();
  const response = await fetch(`/api${url}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    if (!response.ok) {
      throw new Error(`Server returned ${response.status} ${response.statusText || "error"}. / சேவையக பிழை (${response.status}).`);
    }
    throw new Error("Invalid response format from server. / தவறான பதில் வடிவம்.");
  }
  if (!response.ok) {
    const tamil: Record<string, string> = {
      UNAUTHENTICATED: "மீண்டும் உள்நுழையவும்.",
      FORBIDDEN: "இந்தச் செயலைச் செய்ய உங்களுக்கு அனுமதி இல்லை.",
      ALREADY_CHECKED_IN: "ஏற்கனவே ஒரு பணி நடைபெறுகிறது.",
      NOT_CHECKED_IN: "நடப்பில் பணி இல்லை.",
      INVALID_BREAK: "இடைவேளை நேரத்தைச் சரிபார்க்கவும்.",
      INVALID_DURATION: "பணி நேரத்தைச் சரிபார்க்க நிர்வாகியை அணுகவும்.",
      INVALID_INPUT: "படிவ விவரங்களைச் சரிபார்க்கவும்.",
      INVALID_CATEGORY: "உங்கள் நிறுவனத்தின் புகார் வகையைத் தேர்ந்தெடுக்கவும்.",
      INVALID_TRANSITION: "புகார் நிலையைப் படிப்படியாக மாற்றவும்.",
      RATE_LIMITED: "சிறிது நேரம் கழித்து மீண்டும் முயற்சிக்கவும்.",
    };
    throw new Error(
      `${json?.error?.message || "Request failed."} / ${tamil[json?.error?.code] || "கோரிக்கை தோல்வியடைந்தது. மீண்டும் முயற்சிக்கவும்."}`,
    );
  }
  return json as T;
}
