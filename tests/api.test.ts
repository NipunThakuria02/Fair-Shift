import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../server/src/app.js";

describe("Express API: Endpoints and Middleware", () => {
  // Pass mock dependencies so createApp doesn't attempt to load live Firebase credentials during unit tests
  const mockAuth = {
    verifyIdToken: async (token: string) => {
      if (token === "valid-worker-token") {
        return { uid: "test-worker-uid" };
      }
      if (token === "valid-admin-token") {
        return { uid: "test-admin-uid" };
      }
      throw new Error("Invalid token");
    },
  };

  const mockDb = {
    doc: (path: string) => ({
      get: async () => {
        if (path === "users/test-worker-uid") {
          return {
            exists: true,
            data: () => ({
              uid: "test-worker-uid",
              orgId: "test-org",
              role: "WORKER",
              displayName: "Test Worker",
              employeeCode: "TW-1",
              department: "General",
              hourlyRatePaise: 10000,
              active: true,
              language: "en",
            }),
          };
        }
        if (path === "organizations/test-org") {
          return {
            exists: true,
            id: "test-org",
            data: () => ({
              name: "Test Organization",
              industry: "General",
              timeZone: "UTC",
              currency: "INR",
              shiftLimitMinutes: 480,
              minRestMinutes: 660,
              overtimeMultiplier: 1.5,
              departments: ["General"],
              reportCategories: ["GENERAL"],
            }),
          };
        }
        return { exists: false, data: () => null };
      },
    }),
  };

  const app = createApp({
    auth: mockAuth as any,
    db: mockDb as any,
  });

  it("GET /api/health returns status ok with 200", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("applies security headers via helmet", async () => {
    const res = await request(app).get("/api/health");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["content-security-policy"]).toBeDefined();
  });

  it("blocks unauthenticated requests to protected /api/me route", async () => {
    const res = await request(app).get("/api/me");
    expect(res.status).toBe(401);
    expect(res.body.error?.code).toBe("UNAUTHENTICATED");
  });

  it("blocks requests with invalid Bearer token", async () => {
    const res = await request(app)
      .get("/api/me")
      .set("Authorization", "Bearer invalid-token");
    expect(res.status).toBe(401);
    expect(res.body.error?.code).toBe("UNAUTHENTICATED");
  });

  it("returns 404 for nonexistent API routes", async () => {
    const res = await request(app)
      .get("/api/non-existent-endpoint")
      .set("Authorization", "Bearer valid-worker-token");
    // Should return 404
    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe("NOT_FOUND");
  });
});
