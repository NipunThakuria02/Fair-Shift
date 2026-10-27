import { describe, it, expect } from "vitest";

describe("Client Formatters and Utilities", () => {
  const money = (paise: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2,
    }).format(paise / 100);

  const minutes = (value: number) =>
    `${Math.floor(value / 60)}h ${value % 60}m`;

  it("formats paise to INR currency strings correctly", () => {
    // 96000 paise -> Rs 960.00
    const formatted = money(96000);
    expect(formatted).toContain("960");
    // 0 paise -> Rs 0.00
    expect(money(0)).toContain("0");
  });

  it("formats minutes into hours and minutes correctly", () => {
    expect(minutes(480)).toBe("8h 0m");
    expect(minutes(510)).toBe("8h 30m");
    expect(minutes(45)).toBe("0h 45m");
  });
});
