import { describe, it, expect } from "vitest";
import { FairShiftService } from "../server/src/service.js";
import { ApiError } from "../server/src/domain.js";

describe("FairShiftService: Context and User Resolution", () => {
  it("throws UNAUTHENTICATED when user record does not exist", async () => {
    const mockDb = {
      doc: (path: string) => ({
        get: async () => ({
          exists: false,
          data: () => null,
        }),
      }),
    };

    const service = new FairShiftService(mockDb as any);
    await expect(service.context("non-existent-uid")).rejects.toThrow(ApiError);
  });

  it("throws UNAUTHENTICATED when user is inactive", async () => {
    const mockDb = {
      doc: (path: string) => ({
        get: async () => ({
          exists: true,
          data: () => ({
            active: false,
            role: "WORKER",
            orgId: "org-1",
          }),
        }),
      }),
    };

    const service = new FairShiftService(mockDb as any);
    await expect(service.context("inactive-uid")).rejects.toThrow(ApiError);
  });

  it("resolves context when user and organization exist", async () => {
    const mockDb = {
      doc: (path: string) => {
        if (path === "users/valid-uid") {
          return {
            get: async () => ({
              exists: true,
              data: () => ({
                uid: "valid-uid",
                orgId: "org-1",
                role: "WORKER",
                displayName: "Muthu",
                employeeCode: "BW-001",
                department: "Masonry",
                hourlyRatePaise: 12000,
                active: true,
                language: "ta",
              }),
            }),
          };
        }
        if (path === "organizations/org-1") {
          return {
            get: async () => ({
              exists: true,
              id: "org-1",
              data: () => ({
                name: "Buildwell Construction",
                industry: "Construction",
                timeZone: "Asia/Kolkata",
                currency: "INR",
                shiftLimitMinutes: 480,
                minRestMinutes: 660,
                overtimeMultiplier: 2.0,
                departments: ["Masonry"],
                reportCategories: ["SAFETY"],
              }),
            }),
          };
        }
        return {
          get: async () => ({ exists: false, data: () => null }),
        };
      },
    };

    const service = new FairShiftService(mockDb as any);
    const ctx = await service.context("valid-uid");

    expect(ctx.user.displayName).toBe("Muthu");
    expect(ctx.user.role).toBe("WORKER");
    expect(ctx.org.name).toBe("Buildwell Construction");
  });
});
