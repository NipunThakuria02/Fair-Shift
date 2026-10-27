// server/src/app.ts
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import path from "node:path";
import { ZodError } from "zod";

// server/src/firebase.ts
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
function firebase() {
  if (process.env.K_SERVICE && (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST))
    throw new Error("Emulators cannot be used in Cloud Run.");
  if (process.env.NODE_ENV === "production" && (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST))
    throw new Error("Emulators cannot be used in production.");
  const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
  const app2 = getApps()[0] || initializeApp({
    ...projectId ? { projectId } : {},
    ...process.env.FIREBASE_AUTH_EMULATOR_HOST ? {} : { credential: getCredential() }
  });
  return { auth: getAuth(app2), db: getFirestore(app2) };
}

// server/src/service.ts
import {
  Timestamp
} from "firebase-admin/firestore";

// server/src/domain.ts
import { z } from "zod";
var ApiError = class extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
  status;
  code;
};
var policySchema = z.object({
  hourlyRatePaise: z.number().int().min(0).max(1e8),
  shiftLimitMinutes: z.number().int().min(1).max(1440),
  overtimeMultiplier: z.number().min(1).max(5)
});
function calculateEarnings(start, end, breakMinutes, policy) {
  policySchema.parse(policy);
  const elapsed = (end.getTime() - start.getTime()) / 6e4;
  if (!Number.isFinite(elapsed) || elapsed <= 0 || elapsed > 1440)
    throw new ApiError(
      422,
      "INVALID_DURATION",
      "Shift must end after check-in and within 24 hours. Contact your administrator for older shifts."
    );
  const elapsedMinutes = Math.floor(elapsed);
  if (!Number.isInteger(breakMinutes) || breakMinutes < 0 || breakMinutes > elapsedMinutes)
    throw new ApiError(
      422,
      "INVALID_BREAK",
      "Break time must be a whole number within the elapsed shift."
    );
  const workedMinutes = elapsedMinutes - breakMinutes;
  const regularMinutes = Math.min(workedMinutes, policy.shiftLimitMinutes);
  const overtimeMinutes = Math.max(0, workedMinutes - policy.shiftLimitMinutes);
  const regularPayPaise = Math.round(
    regularMinutes * policy.hourlyRatePaise / 60
  );
  const estimatedGrossPaise = Math.round(
    (regularMinutes + overtimeMinutes * policy.overtimeMultiplier) * policy.hourlyRatePaise / 60
  );
  return {
    workedMinutes,
    regularMinutes,
    overtimeMinutes,
    regularPayPaise,
    overtimePayPaise: estimatedGrossPaise - regularPayPaise,
    estimatedGrossPaise
  };
}
var emptySchema = z.object({}).strict();
var checkoutSchema = z.object({ breakMinutes: z.number().int().min(0).max(1440) }).strict();
var reportSchema = z.object({
  category: z.string().trim().min(1).max(80),
  severity: z.enum(["LOW", "MEDIUM", "HIGH"]),
  description: z.string().trim().min(10).max(2e3)
}).strict();
var transitionSchema = z.object({
  status: z.enum(["IN_PROGRESS", "RESOLVED"]),
  note: z.string().trim().min(3).max(1e3)
}).strict();
function assertTransition(from, to) {
  if (!(from === "OPEN" && to === "IN_PROGRESS" || from === "IN_PROGRESS" && to === "RESOLVED"))
    throw new ApiError(
      422,
      "INVALID_TRANSITION",
      "Cases must progress from Open to In progress to Resolved."
    );
}
function requireRole(ctx, role) {
  if (ctx.user.role !== role)
    throw new ApiError(
      403,
      "FORBIDDEN",
      "Your role cannot perform this action."
    );
}

// server/src/service.ts
var PAGE_LIMIT = 200;
function iso(value) {
  return value instanceof Timestamp ? value.toDate().toISOString() : null;
}
function shiftDTO(d) {
  const s = d.data();
  return {
    id: d.id,
    status: s.status,
    checkInAt: iso(s.checkInAt),
    checkOutAt: iso(s.checkOutAt),
    breakMinutes: s.breakMinutes ?? 0,
    regularMinutes: s.regularMinutes ?? 0,
    overtimeMinutes: s.overtimeMinutes ?? 0,
    regularPayPaise: s.regularPayPaise ?? 0,
    overtimePayPaise: s.overtimePayPaise ?? 0,
    estimatedGrossPaise: s.estimatedGrossPaise ?? 0,
    hourlyRatePaiseSnapshot: s.hourlyRatePaiseSnapshot,
    shiftLimitMinutesSnapshot: s.shiftLimitMinutesSnapshot,
    overtimeMultiplierSnapshot: s.overtimeMultiplierSnapshot
  };
}
function reportDTO(d) {
  const r = d.data();
  return {
    id: d.id,
    category: r.category,
    severity: r.severity,
    description: r.description,
    status: r.status,
    createdAt: iso(r.createdAt),
    updatedAt: iso(r.updatedAt)
  };
}
var FairShiftService = class {
  constructor(db) {
    this.db = db;
  }
  db;
  async context(uid) {
    const userDoc = await this.db.doc(`users/${uid}`).get();
    const data = userDoc.data();
    if (!data || data.active !== true || !["WORKER", "ADMIN"].includes(data.role) || typeof data.orgId !== "string")
      throw new ApiError(
        403,
        "PROFILE_REQUIRED",
        "An active organization profile is required."
      );
    const orgDoc = await this.db.doc(`organizations/${data.orgId}`).get();
    if (!orgDoc.exists)
      throw new ApiError(
        403,
        "ORGANIZATION_REQUIRED",
        "Organization is unavailable."
      );
    const o = orgDoc.data();
    const org = {
      id: orgDoc.id,
      name: o.name,
      industry: o.industry,
      timeZone: o.timeZone,
      currency: o.currency,
      shiftLimitMinutes: o.shiftLimitMinutes,
      minRestMinutes: o.minRestMinutes,
      overtimeMultiplier: o.overtimeMultiplier,
      departments: o.departments,
      reportCategories: o.reportCategories
    };
    return { user: { ...data, uid }, org };
  }
  async checkIn(ctx) {
    const guard = this.db.doc(`activeShifts/${ctx.user.uid}`);
    const shift = this.db.collection("shifts").doc();
    await this.db.runTransaction(async (t) => {
      const [active, profile, orgDoc] = await Promise.all([
        t.get(guard),
        t.get(this.db.doc(`users/${ctx.user.uid}`)),
        t.get(this.db.doc(`organizations/${ctx.user.orgId}`))
      ]);
      if (active.exists)
        throw new ApiError(
          409,
          "ALREADY_CHECKED_IN",
          "You already have an active shift."
        );
      const p = profile.data();
      const org = orgDoc.data();
      if (!p || !p.active || p.role !== "WORKER" || p.orgId !== ctx.user.orgId || !org)
        throw new ApiError(
          403,
          "FORBIDDEN",
          "Your profile changed. Sign in again."
        );
      policySchema.parse({
        hourlyRatePaise: p.hourlyRatePaise,
        shiftLimitMinutes: org.shiftLimitMinutes,
        overtimeMultiplier: org.overtimeMultiplier
      });
      const now = Timestamp.now();
      t.create(shift, {
        orgId: p.orgId,
        workerUid: ctx.user.uid,
        checkInAt: now,
        checkOutAt: null,
        status: "ACTIVE",
        breakMinutes: 0,
        hourlyRatePaiseSnapshot: p.hourlyRatePaise,
        shiftLimitMinutesSnapshot: org.shiftLimitMinutes,
        overtimeMultiplierSnapshot: org.overtimeMultiplier
      });
      t.create(guard, { orgId: p.orgId, shiftId: shift.id });
    });
    return shiftDTO(await shift.get());
  }
  async checkOut(ctx, breakMinutes) {
    const guard = this.db.doc(`activeShifts/${ctx.user.uid}`);
    return this.db.runTransaction(async (t) => {
      const active = await t.get(guard);
      if (!active.exists)
        throw new ApiError(
          409,
          "NOT_CHECKED_IN",
          "You do not have an active shift."
        );
      if (active.data().orgId !== ctx.user.orgId)
        throw new ApiError(404, "NOT_FOUND", "Active shift not found.");
      const ref = this.db.doc(`shifts/${active.data().shiftId}`);
      const shift = await t.get(ref);
      const s = shift.data();
      if (!s || s.workerUid !== ctx.user.uid || s.orgId !== ctx.user.orgId || s.status !== "ACTIVE")
        throw new ApiError(
          409,
          "INVALID_SHIFT",
          "Active shift needs administrator attention."
        );
      const now = Timestamp.now();
      const result = calculateEarnings(
        s.checkInAt.toDate(),
        now.toDate(),
        breakMinutes,
        {
          hourlyRatePaise: s.hourlyRatePaiseSnapshot,
          shiftLimitMinutes: s.shiftLimitMinutesSnapshot,
          overtimeMultiplier: s.overtimeMultiplierSnapshot
        }
      );
      t.update(ref, {
        ...result,
        breakMinutes,
        checkOutAt: now,
        status: "COMPLETED"
      });
      t.delete(guard);
      return { id: ref.id, ...result, status: "COMPLETED" };
    });
  }
  async ownShifts(ctx) {
    const base = this.db.collection("shifts").where("orgId", "==", ctx.user.orgId).where("workerUid", "==", ctx.user.uid);
    const [completed, active] = await Promise.all([
      base.where("status", "==", "COMPLETED").orderBy("checkInAt", "desc").limit(PAGE_LIMIT).get(),
      base.where("status", "==", "ACTIVE").limit(1).get()
    ]);
    return {
      items: [...active.docs, ...completed.docs].map(shiftDTO),
      limit: PAGE_LIMIT,
      limited: completed.size === PAGE_LIMIT
    };
  }
  async createReport(ctx, input) {
    if (!ctx.org.reportCategories.includes(input.category))
      throw new ApiError(
        422,
        "INVALID_CATEGORY",
        "Choose a category provided by your organization."
      );
    const ref = this.db.collection("reports").doc();
    const now = Timestamp.now();
    await ref.create({
      ...input,
      orgId: ctx.user.orgId,
      workerUid: ctx.user.uid,
      status: "OPEN",
      createdAt: now,
      updatedAt: now
    });
    return reportDTO(await ref.get());
  }
  async reports(ctx, own) {
    let query = this.db.collection("reports").where("orgId", "==", ctx.user.orgId);
    if (own) query = query.where("workerUid", "==", ctx.user.uid);
    const result = await query.orderBy("createdAt", "desc").limit(PAGE_LIMIT).get();
    const items = await Promise.all(
      result.docs.map(async (d) => {
        const r = reportDTO(d);
        if (!own) return r;
        const updates = await this.db.collection("reportUpdates").where("orgId", "==", ctx.user.orgId).where("reportId", "==", d.id).orderBy("createdAt", "asc").limit(10).get();
        return {
          ...r,
          history: updates.docs.map((u) => {
            const v = u.data();
            return {
              id: u.id,
              fromStatus: v.fromStatus,
              toStatus: v.toStatus,
              note: v.note,
              createdAt: iso(v.createdAt)
            };
          })
        };
      })
    );
    return { items, limit: PAGE_LIMIT, limited: result.size === PAGE_LIMIT };
  }
  async updateReport(ctx, id, input) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(id))
      throw new ApiError(404, "NOT_FOUND", "Case not found.");
    const ref = this.db.doc(`reports/${id}`);
    const update = this.db.collection("reportUpdates").doc();
    const audit = this.db.collection("auditLogs").doc();
    await this.db.runTransaction(async (t) => {
      const doc = await t.get(ref);
      const report = doc.data();
      if (!report || report.orgId !== ctx.user.orgId)
        throw new ApiError(404, "NOT_FOUND", "Case not found.");
      assertTransition(report.status, input.status);
      const now = Timestamp.now();
      t.update(ref, { status: input.status, updatedAt: now });
      t.create(update, {
        orgId: ctx.user.orgId,
        reportId: id,
        actorUid: ctx.user.uid,
        fromStatus: report.status,
        toStatus: input.status,
        note: input.note,
        createdAt: now
      });
      t.create(audit, {
        orgId: ctx.user.orgId,
        actorUid: ctx.user.uid,
        action: "CASE_STATUS_CHANGED",
        resourceType: "report",
        resourceId: id,
        createdAt: now
      });
    });
    return reportDTO(await ref.get());
  }
  async workers(ctx) {
    const result = await this.db.collection("users").where("orgId", "==", ctx.user.orgId).where("role", "==", "WORKER").limit(PAGE_LIMIT).get();
    return {
      items: result.docs.map((d) => {
        const p = d.data();
        return {
          id: d.id,
          displayName: p.displayName,
          employeeCode: p.employeeCode,
          department: p.department,
          active: p.active
        };
      }),
      limit: PAGE_LIMIT,
      limited: result.size === PAGE_LIMIT
    };
  }
  async adminShifts(ctx) {
    const [result, roster] = await Promise.all([
      this.db.collection("shifts").where("orgId", "==", ctx.user.orgId).orderBy("checkInAt", "desc").limit(PAGE_LIMIT).get(),
      this.workers(ctx)
    ]);
    const people = new Map(roster.items.map((person) => [person.id, person]));
    return {
      items: result.docs.map((doc) => {
        const person = people.get(doc.data().workerUid);
        return {
          ...shiftDTO(doc),
          worker: person ? {
            displayName: person.displayName,
            employeeCode: person.employeeCode,
            department: person.department
          } : null
        };
      }),
      limit: PAGE_LIMIT,
      limited: result.size === PAGE_LIMIT || roster.limited
    };
  }
  async overview(ctx) {
    const [shiftResult, reportResult, workerResult] = await Promise.all([
      this.db.collection("shifts").where("orgId", "==", ctx.user.orgId).orderBy("checkInAt", "desc").limit(PAGE_LIMIT).get(),
      this.db.collection("reports").where("orgId", "==", ctx.user.orgId).orderBy("createdAt", "desc").limit(PAGE_LIMIT).get(),
      this.workers(ctx)
    ]);
    const shifts = shiftResult.docs.map((d) => d.data());
    const reports = reportResult.docs.map((d) => d.data());
    const now = Date.now();
    const completed = shifts.filter((s) => s.status === "COMPLETED");
    const active = shifts.filter((s) => s.status === "ACTIVE");
    const longShifts = shifts.filter(
      (s) => ((s.checkOutAt?.toMillis() ?? now) - s.checkInAt.toMillis()) / 6e4 - (s.breakMinutes ?? 0) > (s.shiftLimitMinutesSnapshot ?? ctx.org.shiftLimitMinutes)
    );
    const overdue = reports.filter(
      (r) => r.status !== "RESOLVED" && now - r.createdAt.toMillis() > 48 * 36e5
    );
    let shortRests = 0;
    const byWorker = /* @__PURE__ */ new Map();
    for (const s of shifts) {
      const entries = byWorker.get(s.workerUid) || [];
      entries.push(s);
      byWorker.set(s.workerUid, entries);
    }
    for (const entries of byWorker.values()) {
      entries.sort((a, b) => a.checkInAt.toMillis() - b.checkInAt.toMillis());
      for (let i = 1; i < entries.length; i++) {
        const previous = entries[i - 1];
        if (previous.checkOutAt && (entries[i].checkInAt.toMillis() - previous.checkOutAt.toMillis()) / 6e4 < ctx.org.minRestMinutes)
          shortRests++;
      }
    }
    return {
      presentNow: new Set(active.map((s) => s.workerUid)).size,
      workers: workerResult.items.filter((w) => w.active).length,
      completedShifts: completed.length,
      openCases: reports.filter((r) => r.status === "OPEN").length,
      inProgressCases: reports.filter((r) => r.status === "IN_PROGRESS").length,
      resolvedCases: reports.filter((r) => r.status === "RESOLVED").length,
      estimatedShifts: completed.filter(
        (s) => Number.isInteger(s.estimatedGrossPaise)
      ).length,
      scope: `Most recent ${PAGE_LIMIT} shifts and cases; counts are bounded demo metrics.`,
      limited: shiftResult.size === PAGE_LIMIT || reportResult.size === PAGE_LIMIT || workerResult.limited,
      alerts: [
        {
          key: "LONG_SHIFT",
          count: longShifts.length,
          rule: "Work exceeds the shift\u2019s snapshotted regular-minute limit.",
          action: "Review breaks and staffing before extending work."
        },
        {
          key: "SHORT_REST",
          count: shortRests,
          rule: `Rest between adjacent recorded shifts is below ${ctx.org.minRestMinutes} minutes.`,
          action: "Review the schedule and allow sufficient rest."
        },
        {
          key: "OVERDUE_CASE",
          count: overdue.length,
          rule: "An unresolved case is older than 48 hours (demo policy).",
          action: "Assign a reviewer and follow up with a status update."
        }
      ]
    };
  }
};

// server/src/app.ts
var route = (handler2) => (req, res, next) => {
  Promise.resolve(handler2(req, res)).catch(next);
};
function createApp(dependencies) {
  const app2 = express();
  app2.disable("x-powered-by");
  app2.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          connectSrc: [
            "'self'",
            "https://identitytoolkit.googleapis.com",
            "https://securetoken.googleapis.com",
            "https://*.firebaseapp.com",
            ...process.env.NODE_ENV === "production" ? [] : ["http://127.0.0.1:9099", "http://localhost:9099"]
          ],
          frameSrc: ["'self'", "https://*.firebaseapp.com"],
          imgSrc: ["'self'", "data:"]
        }
      }
    })
  );
  app2.use(express.json({ limit: "16kb" }));
  app2.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });
  app2.use("/api", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app2.use(
    "/api",
    rateLimit({
      windowMs: 6e4,
      limit: 180,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      handler: (_req, res) => res.status(429).json({
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests. Please try again shortly."
        }
      })
    })
  );
  const deps = () => dependencies || firebase();
  app2.use("/api", (req, res, next) => {
    void (async () => {
      const authorization = req.get("Authorization");
      if (!authorization?.startsWith("Bearer ") || authorization.length > 8192)
        throw new ApiError(401, "UNAUTHENTICATED", "Sign in to continue.");
      const { auth, db } = deps();
      let uid;
      try {
        uid = (await auth.verifyIdToken(authorization.slice(7), true)).uid;
      } catch {
        throw new ApiError(
          401,
          "UNAUTHENTICATED",
          "Your session expired. Sign in again."
        );
      }
      res.locals.service = new FairShiftService(db);
      res.locals.context = await res.locals.service.context(uid);
      next();
    })().catch(next);
  });
  const router = express.Router();
  const ctx = (res) => res.locals.context;
  const svc = (res) => res.locals.service;
  router.get(
    "/me",
    route(async (_req, res) => {
      const { user, org } = ctx(res);
      res.json({
        user: {
          uid: user.uid,
          role: user.role,
          displayName: user.displayName,
          employeeCode: user.employeeCode,
          department: user.department,
          language: user.language,
          hourlyRatePaise: user.hourlyRatePaise
        },
        organization: org
      });
    })
  );
  router.post(
    "/shifts/check-in",
    route(async (req, res) => {
      requireRole(ctx(res), "WORKER");
      emptySchema.parse(req.body ?? {});
      res.status(201).json(await svc(res).checkIn(ctx(res)));
    })
  );
  router.post(
    "/shifts/check-out",
    route(async (req, res) => {
      requireRole(ctx(res), "WORKER");
      const body = checkoutSchema.parse(req.body);
      res.json(await svc(res).checkOut(ctx(res), body.breakMinutes));
    })
  );
  router.get(
    "/me/shifts",
    route(async (_req, res) => {
      requireRole(ctx(res), "WORKER");
      res.json(await svc(res).ownShifts(ctx(res)));
    })
  );
  router.get(
    "/me/earnings",
    route(async (_req, res) => {
      requireRole(ctx(res), "WORKER");
      const result = await svc(res).ownShifts(ctx(res));
      const items = result.items.filter((s) => s.status === "COMPLETED");
      res.json({
        ...result,
        items,
        totalEstimatedPaise: items.reduce(
          (sum, s) => sum + s.estimatedGrossPaise,
          0
        )
      });
    })
  );
  router.post(
    "/reports",
    route(async (req, res) => {
      requireRole(ctx(res), "WORKER");
      const body = reportSchema.parse(req.body);
      res.status(201).json(await svc(res).createReport(ctx(res), body));
    })
  );
  router.get(
    "/me/reports",
    route(async (_req, res) => {
      requireRole(ctx(res), "WORKER");
      res.json(await svc(res).reports(ctx(res), true));
    })
  );
  router.get(
    "/admin/overview",
    route(async (_req, res) => {
      requireRole(ctx(res), "ADMIN");
      res.json(await svc(res).overview(ctx(res)));
    })
  );
  router.get(
    "/admin/workers",
    route(async (_req, res) => {
      requireRole(ctx(res), "ADMIN");
      res.json(await svc(res).workers(ctx(res)));
    })
  );
  router.get(
    "/admin/shifts",
    route(async (_req, res) => {
      requireRole(ctx(res), "ADMIN");
      res.json(await svc(res).adminShifts(ctx(res)));
    })
  );
  router.get(
    "/admin/reports",
    route(async (_req, res) => {
      requireRole(ctx(res), "ADMIN");
      res.json(await svc(res).reports(ctx(res), false));
    })
  );
  router.patch(
    "/admin/reports/:id",
    route(async (req, res) => {
      requireRole(ctx(res), "ADMIN");
      const body = transitionSchema.parse(req.body);
      res.json(
        await svc(res).updateReport(ctx(res), String(req.params.id), body)
      );
    })
  );
  app2.use("/api", router);
  app2.use("/api", (_req, res) => {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "API route not found." } });
  });
  app2.use(express.static(path.resolve("client/dist")));
  app2.get("/{*path}", (_req, res) => {
    res.sendFile(path.resolve("client/dist/index.html"));
  });
  app2.use((err, _req, res, _next) => {
    if (err instanceof ApiError) {
      res.status(err.status).json({ error: { code: err.code, message: err.message } });
      return;
    }
    if (err instanceof ZodError) {
      res.status(422).json({
        error: {
          code: "INVALID_INPUT",
          message: "Check the form fields and try again."
        }
      });
      return;
    }
    const status = typeof err === "object" && err !== null && "status" in err ? Number(err.status) : 500;
    if (status === 400 || status === 413) {
      res.status(status).json({
        error: {
          code: "INVALID_REQUEST",
          message: status === 413 ? "Request is too large." : "Request contains invalid JSON."
        }
      });
      return;
    }
    console.error(
      JSON.stringify({
        event: "request_failed",
        code: typeof err === "object" && err !== null && "code" in err ? String(err.code) : "INTERNAL"
      })
    );
    res.status(500).json({
      error: {
        code: "INTERNAL",
        message: "The request could not be completed. Please try again."
      }
    });
  });
  return app2;
}

// server/src/vercel.ts
var app = createApp();
function handler(req, res) {
  return app(req, res);
}
export {
  handler as default
};
