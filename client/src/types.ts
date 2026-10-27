export interface UserProfile {
  uid: string;
  role: "WORKER" | "ADMIN";
  displayName: string;
  employeeCode: string;
  department: string;
  language: string;
  hourlyRatePaise?: number;
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
  reportCategories: string[];
  departments: string[];
}
export interface Me {
  user: UserProfile;
  organization: Organization;
}
export interface Shift {
  worker?: {
    displayName: string;
    employeeCode: string;
    department: string;
  } | null;
  id: string;
  status: "ACTIVE" | "COMPLETED";
  checkInAt: string;
  checkOutAt: string | null;
  breakMinutes: number;
  regularMinutes: number;
  overtimeMinutes: number;
  regularPayPaise: number;
  overtimePayPaise: number;
  estimatedGrossPaise: number;
  hourlyRatePaiseSnapshot: number;
  shiftLimitMinutesSnapshot: number;
  overtimeMultiplierSnapshot: number;
}
export interface Report {
  id: string;
  category: string;
  severity: string;
  description: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  history?: {
    id: string;
    fromStatus: string;
    toStatus: string;
    note: string;
    createdAt: string;
  }[];
}
export interface List<T> {
  items: T[];
  limited: boolean;
  limit: number;
}
export interface Overview {
  presentNow: number;
  workers: number;
  completedShifts: number;
  openCases: number;
  inProgressCases: number;
  resolvedCases: number;
  estimatedShifts: number;
  scope: string;
  limited: boolean;
  alerts: { key: string; count: number; rule: string; action: string }[];
}
export interface Worker {
  id: string;
  displayName: string;
  employeeCode: string;
  department: string;
  active: boolean;
}
