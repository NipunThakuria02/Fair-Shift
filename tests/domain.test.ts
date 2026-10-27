import { describe, it, expect } from "vitest";
import {
  calculateEarnings,
  policySchema,
  emptySchema,
  checkoutSchema,
  reportSchema,
  transitionSchema,
  assertTransition,
  requireRole,
  ApiError,
  type Context,
} from "../server/src/domain.js";

describe("Domain: calculateEarnings", () => {
  const standardPolicy = {
    hourlyRatePaise: 12000, // Rs 120.00 / hour
    shiftLimitMinutes: 480, // 8 hours
    overtimeMultiplier: 2.0, // 2x for overtime
  };

  it("calculates regular 8-hour shift earnings correctly", () => {
    const start = new Date("2026-10-27T08:00:00Z");
    const end = new Date("2026-10-27T16:00:00Z"); // 8 hours = 480 mins
    const result = calculateEarnings(start, end, 0, standardPolicy);

    expect(result.workedMinutes).toBe(480);
    expect(result.regularMinutes).toBe(480);
    expect(result.overtimeMinutes).toBe(0);
    expect(result.regularPayPaise).toBe(96000); // 8 * 12000 = 96000 paise (Rs 960)
    expect(result.overtimePayPaise).toBe(0);
    expect(result.estimatedGrossPaise).toBe(96000);
  });

  it("deducts break minutes from worked time", () => {
    const start = new Date("2026-10-27T08:00:00Z");
    const end = new Date("2026-10-27T17:00:00Z"); // 9 hours = 540 mins
    const result = calculateEarnings(start, end, 60, standardPolicy); // 60 min break

    expect(result.workedMinutes).toBe(480);
    expect(result.regularMinutes).toBe(480);
    expect(result.overtimeMinutes).toBe(0);
    expect(result.estimatedGrossPaise).toBe(96000);
  });

  it("calculates overtime with correct multiplier", () => {
    const start = new Date("2026-10-27T08:00:00Z");
    const end = new Date("2026-10-27T18:00:00Z"); // 10 hours = 600 mins worked
    const result = calculateEarnings(start, end, 0, standardPolicy);

    expect(result.workedMinutes).toBe(600);
    expect(result.regularMinutes).toBe(480);
    expect(result.overtimeMinutes).toBe(120); // 2 hours overtime
    expect(result.regularPayPaise).toBe(96000); // Rs 960
    // Overtime: 2 hours * 12000 * 2.0 = 48000 paise (Rs 480)
    expect(result.overtimePayPaise).toBe(48000);
    expect(result.estimatedGrossPaise).toBe(144000); // Rs 1440 total
  });

  it("throws INVALID_DURATION when shift is 0 or negative duration", () => {
    const start = new Date("2026-10-27T08:00:00Z");
    const end = new Date("2026-10-27T08:00:00Z");
    expect(() => calculateEarnings(start, end, 0, standardPolicy)).toThrowError(
      ApiError,
    );
  });

  it("throws INVALID_DURATION when shift exceeds 24 hours", () => {
    const start = new Date("2026-10-27T08:00:00Z");
    const end = new Date("2026-10-28T08:05:00Z"); // 24h 5m
    expect(() => calculateEarnings(start, end, 0, standardPolicy)).toThrowError(
      ApiError,
    );
  });

  it("throws INVALID_BREAK when break is negative or greater than shift duration", () => {
    const start = new Date("2026-10-27T08:00:00Z");
    const end = new Date("2026-10-27T12:00:00Z"); // 4 hours = 240 mins
    expect(() => calculateEarnings(start, end, -15, standardPolicy)).toThrowError(
      ApiError,
    );
    expect(() => calculateEarnings(start, end, 300, standardPolicy)).toThrowError(
      ApiError,
    );
  });
});

describe("Domain: Schemas and Validations", () => {
  it("validates policySchema constraints", () => {
    expect(() =>
      policySchema.parse({
        hourlyRatePaise: -5,
        shiftLimitMinutes: 480,
        overtimeMultiplier: 1.5,
      }),
    ).toThrow();

    expect(() =>
      policySchema.parse({
        hourlyRatePaise: 10000,
        shiftLimitMinutes: 0,
        overtimeMultiplier: 1.5,
      }),
    ).toThrow();
  });

  it("validates emptySchema forbids extra fields", () => {
    expect(emptySchema.parse({})).toEqual({});
    expect(() => emptySchema.parse({ extra: true })).toThrow();
  });

  it("validates checkoutSchema break limits", () => {
    expect(checkoutSchema.parse({ breakMinutes: 30 })).toEqual({
      breakMinutes: 30,
    });
    expect(() => checkoutSchema.parse({ breakMinutes: -1 })).toThrow();
    expect(() => checkoutSchema.parse({ breakMinutes: 1500 })).toThrow();
  });

  it("validates reportSchema fields", () => {
    const valid = {
      category: "SAFETY",
      severity: "HIGH",
      description: "Scaffolding on level 3 is unsecured and swaying in high wind.",
    };
    expect(reportSchema.parse(valid)).toEqual(valid);

    // Too short description (< 10 chars)
    expect(() =>
      reportSchema.parse({ ...valid, description: "too short" }),
    ).toThrow();
  });

  it("validates report transition rules", () => {
    expect(() => assertTransition("OPEN", "IN_PROGRESS")).not.toThrow();
    expect(() => assertTransition("IN_PROGRESS", "RESOLVED")).not.toThrow();
    expect(() => assertTransition("OPEN", "RESOLVED")).toThrow(ApiError);
    expect(() => assertTransition("RESOLVED", "OPEN")).toThrow(ApiError);
  });
});

describe("Domain: requireRole Authorization", () => {
  const workerCtx: Context = {
    user: {
      uid: "user-worker-1",
      orgId: "org-1",
      role: "WORKER",
      displayName: "Muthu Worker",
      employeeCode: "BW-001",
      department: "Masonry",
      hourlyRatePaise: 12000,
      active: true,
      language: "ta",
    },
    org: {
      id: "org-1",
      name: "Buildwell Construction",
      industry: "Construction",
      timeZone: "Asia/Kolkata",
      currency: "INR",
      shiftLimitMinutes: 480,
      minRestMinutes: 660,
      overtimeMultiplier: 2.0,
      departments: ["Masonry", "Electrical"],
      reportCategories: ["SAFETY", "WAGE_DISPUTE"],
    },
  };

  const adminCtx: Context = {
    ...workerCtx,
    user: {
      ...workerCtx.user,
      role: "ADMIN",
    },
  };

  it("allows matching role and forbids mismatching role", () => {
    expect(() => requireRole(workerCtx, "WORKER")).not.toThrow();
    expect(() => requireRole(workerCtx, "ADMIN")).toThrow(ApiError);
    expect(() => requireRole(adminCtx, "ADMIN")).not.toThrow();
    expect(() => requireRole(adminCtx, "WORKER")).toThrow(ApiError);
  });
});
