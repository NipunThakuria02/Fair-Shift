import { pathToFileURL } from "node:url";
import { Timestamp } from "firebase-admin/firestore";
import { firebase } from "../server/src/firebase.js";
import { calculateEarnings } from "../server/src/domain.js";
export const organizations = [
  {
    id: "construction",
    name: "Buildwell Construction",
    industry: "CONSTRUCTION",
    timeZone: "Asia/Kolkata",
    currency: "INR",
    shiftLimitMinutes: 480,
    minRestMinutes: 660,
    overtimeMultiplier: 1.5,
    departments: ["Site operations", "Equipment"],
    reportCategories: [
      "PPE & equipment",
      "Site safety",
      "Pay clarification",
      "Workplace conduct",
    ],
  },
  {
    id: "college",
    name: "Greenfield College",
    industry: "COLLEGE",
    timeZone: "Asia/Kolkata",
    currency: "INR",
    shiftLimitMinutes: 420,
    minRestMinutes: 720,
    overtimeMultiplier: 1.5,
    departments: ["Housekeeping", "Security", "Maintenance"],
    reportCategories: [
      "Campus maintenance",
      "Security concern",
      "Pay clarification",
      "Workplace conduct",
    ],
  },
];
export const accounts = [
  {
    uid: "demo-construction-worker",
    email: "worker.construction@fairshift.example",
    orgId: "construction",
    role: "WORKER",
    displayName: "Demo Arun",
    employeeCode: "BW-101",
    department: "Site operations",
    hourlyRatePaise: 12500,
  },
  {
    uid: "demo-construction-worker-2",
    email: "worker2.construction@fairshift.example",
    orgId: "construction",
    role: "WORKER",
    displayName: "Demo Priya",
    employeeCode: "BW-102",
    department: "Equipment",
    hourlyRatePaise: 15000,
  },
  {
    uid: "demo-construction-admin",
    email: "admin.construction@fairshift.example",
    orgId: "construction",
    role: "ADMIN",
    displayName: "Demo Meera",
    employeeCode: "BW-001",
    department: "Management",
    hourlyRatePaise: 0,
  },
  {
    uid: "demo-college-worker",
    email: "worker.college@fairshift.example",
    orgId: "college",
    role: "WORKER",
    displayName: "Demo Kavin",
    employeeCode: "GC-101",
    department: "Housekeeping",
    hourlyRatePaise: 11000,
  },
  {
    uid: "demo-college-admin",
    email: "admin.college@fairshift.example",
    orgId: "college",
    role: "ADMIN",
    displayName: "Demo Devi",
    employeeCode: "GC-001",
    department: "Management",
    hourlyRatePaise: 0,
  },
] as const;
export async function seed(password: string) {
  if (password.length < 12)
    throw new Error(
      "SEED_PASSWORD must be at least 12 characters. Supply it securely; never commit it.",
    );
  const { auth, db } = firebase();
  if (
    (await db.collection("users").limit(1).get()).size ||
    (await db.collection("organizations").limit(1).get()).size
  )
    throw new Error(
      "Database already contains profiles or organizations; refusing to overwrite.",
    );
  // Preflight all identities before any writes. Existing identities are never reset.
  for (const a of accounts) {
    for (const lookup of [
      () => auth.getUser(a.uid),
      () => auth.getUserByEmail(a.email),
    ]) {
      try {
        await lookup();
        throw new Error(
          "A seed identity already exists; refusing to overwrite.",
        );
      } catch (e) {
        if (!(
          typeof e === "object" &&
          e &&
          "code" in e &&
          e.code === "auth/user-not-found"
        ))
          throw e;
      }
    }
  }
  const created: string[] = [];
  try {
    for (const a of accounts) {
      await auth.createUser({
        uid: a.uid,
        email: a.email,
        password,
        displayName: a.displayName,
      });
      created.push(a.uid);
    }
    const batch = db.batch();
    for (const org of organizations) {
      const { id, ...data } = org;
      batch.create(db.doc(`organizations/${id}`), {
        ...data,
        syntheticDemo: true,
      });
    }
    for (const { email: _email, ...a } of accounts)
      batch.create(db.doc(`users/${a.uid}`), {
        ...a,
        active: true,
        language: "en",
        syntheticDemo: true,
      });
    for (const org of organizations) {
      const worker = accounts.find(
        (a) => a.orgId === org.id && a.role === "WORKER",
      )!;
      const start = new Date(Date.now() - 3 * 86400_000);
      const end = new Date(start.getTime() + 10 * 3600_000);
      const result = calculateEarnings(start, end, 30, {
        hourlyRatePaise: worker.hourlyRatePaise,
        ...org,
      });
      batch.create(db.doc(`shifts/seed-${org.id}`), {
        ...result,
        orgId: org.id,
        workerUid: worker.uid,
        checkInAt: Timestamp.fromDate(start),
        checkOutAt: Timestamp.fromDate(end),
        status: "COMPLETED",
        breakMinutes: 30,
        hourlyRatePaiseSnapshot: worker.hourlyRatePaise,
        shiftLimitMinutesSnapshot: org.shiftLimitMinutes,
        overtimeMultiplierSnapshot: org.overtimeMultiplier,
        syntheticDemo: true,
      });
      const createdAt = Timestamp.fromMillis(Date.now() - 60 * 3600_000);
      batch.create(db.doc(`reports/seed-${org.id}`), {
        orgId: org.id,
        workerUid: worker.uid,
        category: org.reportCategories[0],
        severity: "MEDIUM",
        description:
          "Synthetic demo concern: please review the safety equipment for this work area.",
        status: "OPEN",
        createdAt,
        updatedAt: createdAt,
        syntheticDemo: true,
      });
    }
    await batch.commit();
  } catch (error) {
    await Promise.allSettled(created.map((uid) => auth.deleteUser(uid)));
    throw error;
  }
  return {
    accounts: accounts.map((a) => ({
      email: a.email,
      role: a.role,
      organization: a.orgId,
    })),
    organizations: organizations.length,
  };
}
async function main() {
  const emulated =
    !!process.env.FIRESTORE_EMULATOR_HOST &&
    !!process.env.FIREBASE_AUTH_EMULATOR_HOST;
  if (
    !emulated &&
    (!process.env.GCLOUD_PROJECT ||
      process.env.CONFIRM_SEED_PROJECT !== process.env.GCLOUD_PROJECT)
  )
    throw new Error(
      "For a real project, set CONFIRM_SEED_PROJECT to GCLOUD_PROJECT explicitly.",
    );
  const result = await seed(process.env.SEED_PASSWORD || "");
  console.info(JSON.stringify({ event: "synthetic_demo_seeded", ...result }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((err) => {
    console.error("SEED_ERROR:", err);
    console.error(
      "Seed failed. Ensure a fresh database, new seed identities, valid project access, and a secure SEED_PASSWORD of at least 12 characters. No existing data was overwritten.",
    );
    process.exitCode = 1;
  });
