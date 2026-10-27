import {
  Timestamp,
  type Firestore,
  type DocumentSnapshot,
  type Query,
  type DocumentData,
} from "firebase-admin/firestore";
import {
  ApiError,
  assertTransition,
  calculateEarnings,
  policySchema,
  type Context,
  type Organization,
  type Profile,
} from "./domain.js";
export const PAGE_LIMIT = 200;
function iso(value: unknown): string | null {
  return value instanceof Timestamp ? value.toDate().toISOString() : null;
}
function shiftDTO(d: DocumentSnapshot) {
  const s = d.data()!;
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
    overtimeMultiplierSnapshot: s.overtimeMultiplierSnapshot,
  };
}
function reportDTO(d: DocumentSnapshot) {
  const r = d.data()!;
  return {
    id: d.id,
    category: r.category,
    severity: r.severity,
    description: r.description,
    status: r.status,
    createdAt: iso(r.createdAt),
    updatedAt: iso(r.updatedAt),
  };
}
export class FairShiftService {
  constructor(public db: Firestore) {}
  async context(uid: string): Promise<Context> {
    const userDoc = await this.db.doc(`users/${uid}`).get();
    const data = userDoc.data();
    if (
      !data ||
      data.active !== true ||
      !["WORKER", "ADMIN"].includes(data.role) ||
      typeof data.orgId !== "string"
    )
      throw new ApiError(
        403,
        "PROFILE_REQUIRED",
        "An active organization profile is required.",
      );
    const orgDoc = await this.db.doc(`organizations/${data.orgId}`).get();
    if (!orgDoc.exists)
      throw new ApiError(
        403,
        "ORGANIZATION_REQUIRED",
        "Organization is unavailable.",
      );
    const o = orgDoc.data()!;
    const org: Organization = {
      id: orgDoc.id,
      name: o.name,
      industry: o.industry,
      timeZone: o.timeZone,
      currency: o.currency,
      shiftLimitMinutes: o.shiftLimitMinutes,
      minRestMinutes: o.minRestMinutes,
      overtimeMultiplier: o.overtimeMultiplier,
      departments: o.departments,
      reportCategories: o.reportCategories,
    };
    return { user: { ...data, uid } as Profile, org };
  }
  async checkIn(ctx: Context) {
    const guard = this.db.doc(`activeShifts/${ctx.user.uid}`);
    const shift = this.db.collection("shifts").doc();
    await this.db.runTransaction(async (t) => {
      const [active, profile, orgDoc] = await Promise.all([
        t.get(guard),
        t.get(this.db.doc(`users/${ctx.user.uid}`)),
        t.get(this.db.doc(`organizations/${ctx.user.orgId}`)),
      ]);
      if (active.exists)
        throw new ApiError(
          409,
          "ALREADY_CHECKED_IN",
          "You already have an active shift.",
        );
      const p = profile.data();
      const org = orgDoc.data();
      if (
        !p ||
        !p.active ||
        p.role !== "WORKER" ||
        p.orgId !== ctx.user.orgId ||
        !org
      )
        throw new ApiError(
          403,
          "FORBIDDEN",
          "Your profile changed. Sign in again.",
        );
      policySchema.parse({
        hourlyRatePaise: p.hourlyRatePaise,
        shiftLimitMinutes: org.shiftLimitMinutes,
        overtimeMultiplier: org.overtimeMultiplier,
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
        overtimeMultiplierSnapshot: org.overtimeMultiplier,
      });
      t.create(guard, { orgId: p.orgId, shiftId: shift.id });
    });
    return shiftDTO(await shift.get());
  }
  async checkOut(ctx: Context, breakMinutes: number) {
    const guard = this.db.doc(`activeShifts/${ctx.user.uid}`);
    return this.db.runTransaction(async (t) => {
      const active = await t.get(guard);
      if (!active.exists)
        throw new ApiError(
          409,
          "NOT_CHECKED_IN",
          "You do not have an active shift.",
        );
      if (active.data()!.orgId !== ctx.user.orgId)
        throw new ApiError(404, "NOT_FOUND", "Active shift not found.");
      const ref = this.db.doc(`shifts/${active.data()!.shiftId}`);
      const shift = await t.get(ref);
      const s = shift.data();
      if (
        !s ||
        s.workerUid !== ctx.user.uid ||
        s.orgId !== ctx.user.orgId ||
        s.status !== "ACTIVE"
      )
        throw new ApiError(
          409,
          "INVALID_SHIFT",
          "Active shift needs administrator attention.",
        );
      const now = Timestamp.now();
      const result = calculateEarnings(
        s.checkInAt.toDate(),
        now.toDate(),
        breakMinutes,
        {
          hourlyRatePaise: s.hourlyRatePaiseSnapshot,
          shiftLimitMinutes: s.shiftLimitMinutesSnapshot,
          overtimeMultiplier: s.overtimeMultiplierSnapshot,
        },
      );
      t.update(ref, {
        ...result,
        breakMinutes,
        checkOutAt: now,
        status: "COMPLETED",
      });
      t.delete(guard);
      return { id: ref.id, ...result, status: "COMPLETED" };
    });
  }
  async ownShifts(ctx: Context) {
    const base = this.db
      .collection("shifts")
      .where("orgId", "==", ctx.user.orgId)
      .where("workerUid", "==", ctx.user.uid);
    const [completed, active] = await Promise.all([
      base
        .where("status", "==", "COMPLETED")
        .orderBy("checkInAt", "desc")
        .limit(PAGE_LIMIT)
        .get(),
      base.where("status", "==", "ACTIVE").limit(1).get(),
    ]);
    return {
      items: [...active.docs, ...completed.docs].map(shiftDTO),
      limit: PAGE_LIMIT,
      limited: completed.size === PAGE_LIMIT,
    };
  }
  async createReport(
    ctx: Context,
    input: { category: string; severity: string; description: string },
  ) {
    if (!ctx.org.reportCategories.includes(input.category))
      throw new ApiError(
        422,
        "INVALID_CATEGORY",
        "Choose a category provided by your organization.",
      );
    const ref = this.db.collection("reports").doc();
    const now = Timestamp.now();
    await ref.create({
      ...input,
      orgId: ctx.user.orgId,
      workerUid: ctx.user.uid,
      status: "OPEN",
      createdAt: now,
      updatedAt: now,
    });
    return reportDTO(await ref.get());
  }
  async reports(ctx: Context, own: boolean) {
    let query: Query<DocumentData> = this.db
      .collection("reports")
      .where("orgId", "==", ctx.user.orgId);
    if (own) query = query.where("workerUid", "==", ctx.user.uid);
    const result = await query
      .orderBy("createdAt", "desc")
      .limit(PAGE_LIMIT)
      .get();
    const items = await Promise.all(
      result.docs.map(async (d) => {
        const r = reportDTO(d);
        if (!own) return r;
        const updates = await this.db
          .collection("reportUpdates")
          .where("orgId", "==", ctx.user.orgId)
          .where("reportId", "==", d.id)
          .orderBy("createdAt", "asc")
          .limit(10)
          .get();
        return {
          ...r,
          history: updates.docs.map((u) => {
            const v = u.data();
            return {
              id: u.id,
              fromStatus: v.fromStatus,
              toStatus: v.toStatus,
              note: v.note,
              createdAt: iso(v.createdAt),
            };
          }),
        };
      }),
    );
    return { items, limit: PAGE_LIMIT, limited: result.size === PAGE_LIMIT };
  }
  async updateReport(
    ctx: Context,
    id: string,
    input: { status: string; note: string },
  ) {
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
        createdAt: now,
      });
      t.create(audit, {
        orgId: ctx.user.orgId,
        actorUid: ctx.user.uid,
        action: "CASE_STATUS_CHANGED",
        resourceType: "report",
        resourceId: id,
        createdAt: now,
      });
    });
    return reportDTO(await ref.get());
  }
  async workers(ctx: Context) {
    const result = await this.db
      .collection("users")
      .where("orgId", "==", ctx.user.orgId)
      .where("role", "==", "WORKER")
      .limit(PAGE_LIMIT)
      .get();
    return {
      items: result.docs.map((d) => {
        const p = d.data();
        return {
          id: d.id,
          displayName: p.displayName,
          employeeCode: p.employeeCode,
          department: p.department,
          active: p.active,
        };
      }),
      limit: PAGE_LIMIT,
      limited: result.size === PAGE_LIMIT,
    };
  }
  async adminShifts(ctx: Context) {
    const [result, roster] = await Promise.all([
      this.db
        .collection("shifts")
        .where("orgId", "==", ctx.user.orgId)
        .orderBy("checkInAt", "desc")
        .limit(PAGE_LIMIT)
        .get(),
      this.workers(ctx),
    ]);
    const people = new Map(roster.items.map((person) => [person.id, person]));
    return {
      items: result.docs.map((doc) => {
        const person = people.get(doc.data().workerUid);
        return {
          ...shiftDTO(doc),
          worker: person
            ? {
                displayName: person.displayName,
                employeeCode: person.employeeCode,
                department: person.department,
              }
            : null,
        };
      }),
      limit: PAGE_LIMIT,
      limited: result.size === PAGE_LIMIT || roster.limited,
    };
  }
  async overview(ctx: Context) {
    const [shiftResult, reportResult, workerResult] = await Promise.all([
      this.db
        .collection("shifts")
        .where("orgId", "==", ctx.user.orgId)
        .orderBy("checkInAt", "desc")
        .limit(PAGE_LIMIT)
        .get(),
      this.db
        .collection("reports")
        .where("orgId", "==", ctx.user.orgId)
        .orderBy("createdAt", "desc")
        .limit(PAGE_LIMIT)
        .get(),
      this.workers(ctx),
    ]);
    const shifts = shiftResult.docs.map((d) => d.data());
    const reports = reportResult.docs.map((d) => d.data());
    const now = Date.now();
    const completed = shifts.filter((s) => s.status === "COMPLETED");
    const active = shifts.filter((s) => s.status === "ACTIVE");
    const longShifts = shifts.filter(
      (s) =>
        ((s.checkOutAt?.toMillis() ?? now) - s.checkInAt.toMillis()) / 60000 -
          (s.breakMinutes ?? 0) >
        (s.shiftLimitMinutesSnapshot ?? ctx.org.shiftLimitMinutes),
    );
    const overdue = reports.filter(
      (r) =>
        r.status !== "RESOLVED" && now - r.createdAt.toMillis() > 48 * 3600_000,
    );
    let shortRests = 0;
    const byWorker = new Map<string, DocumentData[]>();
    for (const s of shifts) {
      const entries = byWorker.get(s.workerUid) || [];
      entries.push(s);
      byWorker.set(s.workerUid, entries);
    }
    for (const entries of byWorker.values()) {
      entries.sort((a, b) => a.checkInAt.toMillis() - b.checkInAt.toMillis());
      for (let i = 1; i < entries.length; i++) {
        const previous = entries[i - 1];
        if (
          previous.checkOutAt &&
          (entries[i].checkInAt.toMillis() - previous.checkOutAt.toMillis()) /
            60000 <
            ctx.org.minRestMinutes
        )
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
      estimatedShifts: completed.filter((s) =>
        Number.isInteger(s.estimatedGrossPaise),
      ).length,
      scope: `Most recent ${PAGE_LIMIT} shifts and cases; counts are bounded demo metrics.`,
      limited:
        shiftResult.size === PAGE_LIMIT ||
        reportResult.size === PAGE_LIMIT ||
        workerResult.limited,
      alerts: [
        {
          key: "LONG_SHIFT",
          count: longShifts.length,
          rule: "Work exceeds the shift’s snapshotted regular-minute limit.",
          action: "Review breaks and staffing before extending work.",
        },
        {
          key: "SHORT_REST",
          count: shortRests,
          rule: `Rest between adjacent recorded shifts is below ${ctx.org.minRestMinutes} minutes.`,
          action: "Review the schedule and allow sufficient rest.",
        },
        {
          key: "OVERDUE_CASE",
          count: overdue.length,
          rule: "An unresolved case is older than 48 hours (demo policy).",
          action: "Assign a reviewer and follow up with a status update.",
        },
      ],
    };
  }
}
