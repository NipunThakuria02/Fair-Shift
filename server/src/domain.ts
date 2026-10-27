import { z } from "zod";
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export const policySchema = z.object({
  hourlyRatePaise: z.number().int().min(0).max(100_000_000),
  shiftLimitMinutes: z.number().int().min(1).max(1440),
  overtimeMultiplier: z.number().min(1).max(5),
});
export type Policy = z.infer<typeof policySchema>;
export function calculateEarnings(
  start: Date,
  end: Date,
  breakMinutes: number,
  policy: Policy,
) {
  policySchema.parse(policy);
  const elapsed = (end.getTime() - start.getTime()) / 60_000;
  if (!Number.isFinite(elapsed) || elapsed <= 0 || elapsed > 1440)
    throw new ApiError(
      422,
      "INVALID_DURATION",
      "Shift must end after check-in and within 24 hours. Contact your administrator for older shifts.",
    );
  const elapsedMinutes = Math.floor(elapsed);
  if (
    !Number.isInteger(breakMinutes) ||
    breakMinutes < 0 ||
    breakMinutes > elapsedMinutes
  )
    throw new ApiError(
      422,
      "INVALID_BREAK",
      "Break time must be a whole number within the elapsed shift.",
    );
  const workedMinutes = elapsedMinutes - breakMinutes;
  const regularMinutes = Math.min(workedMinutes, policy.shiftLimitMinutes);
  const overtimeMinutes = Math.max(0, workedMinutes - policy.shiftLimitMinutes);
  const regularPayPaise = Math.round(
    (regularMinutes * policy.hourlyRatePaise) / 60,
  );
  const estimatedGrossPaise = Math.round(
    ((regularMinutes + overtimeMinutes * policy.overtimeMultiplier) *
      policy.hourlyRatePaise) /
      60,
  );
  return {
    workedMinutes,
    regularMinutes,
    overtimeMinutes,
    regularPayPaise,
    overtimePayPaise: estimatedGrossPaise - regularPayPaise,
    estimatedGrossPaise,
  };
}
export const emptySchema = z.object({}).strict();
export const checkoutSchema = z
  .object({ breakMinutes: z.number().int().min(0).max(1440) })
  .strict();
export const reportSchema = z
  .object({
    category: z.string().trim().min(1).max(80),
    severity: z.enum(["LOW", "MEDIUM", "HIGH"]),
    description: z.string().trim().min(10).max(2000),
  })
  .strict();
export const transitionSchema = z
  .object({
    status: z.enum(["IN_PROGRESS", "RESOLVED"]),
    note: z.string().trim().min(3).max(1000),
  })
  .strict();
export function assertTransition(from: string, to: string) {
  if (!(
    (from === "OPEN" && to === "IN_PROGRESS") ||
    (from === "IN_PROGRESS" && to === "RESOLVED")
  ))
    throw new ApiError(
      422,
      "INVALID_TRANSITION",
      "Cases must progress from Open to In progress to Resolved.",
    );
}
export interface Profile {
  uid: string;
  orgId: string;
  role: "WORKER" | "ADMIN";
  displayName: string;
  employeeCode: string;
  department: string;
  hourlyRatePaise: number;
  active: boolean;
  language: string;
}
export interface Organization {
  id: string;
  name: string;
  industry: string;
  timeZone: string;
  currency: string;
  shiftLimitMinutes: number;
  minRestMinutes: number;
  overtimeMultiplier: number;
  departments: string[];
  reportCategories: string[];
}
export interface Context {
  user: Profile;
  org: Organization;
}
export function requireRole(ctx: Context, role: Profile["role"]) {
  if (ctx.user.role !== role)
    throw new ApiError(
      403,
      "FORBIDDEN",
      "Your role cannot perform this action.",
    );
}
