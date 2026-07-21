import { describe, it, expect } from "vitest";
import { getTemplate, renderEmail } from "../server/email-templates";

const baseTokens = {
  NAME: "Jane Doe",
  FIRST_NAME: "Jane",
  DATE: "Monday 3 August 2026",
  SLOT_LABEL: "Night",
  TIME_RANGE: "20:00 – 08:00",
  PATIENT_FIRST_NAME: "Arthur",
  PORTAL_URL: "https://example.test/portal/tok",
};

describe("roster_shift_change email template", () => {
  it("is registered in the template registry (nurse category)", () => {
    const def = getTemplate("roster_shift_change");
    expect(def).toBeTruthy();
    expect(def!.category).toBe("nurse");
    expect(def!.tokens.map((t) => t.name)).toContain("{{PATIENT_FIRST_NAME}}");
  });

  it("renders the 'added' variant with subject, intro, and shift details", async () => {
    const r = await renderEmail("roster_shift_change", { ...baseTokens, ADDED: "1", REMOVED: "" });
    expect(r.subject).toContain("new shift on Monday 3 August 2026");
    expect(r.subject).not.toContain("cancelled");
    expect(r.text).toContain("allocated a new shift");
    expect(r.html).toContain("Arthur");
    expect(r.html).toContain("20:00");
    expect(r.html).toContain(baseTokens.PORTAL_URL);
  });

  it("renders the 'removed' variant with cancellation wording", async () => {
    const r = await renderEmail("roster_shift_change", { ...baseTokens, ADDED: "", REMOVED: "1" });
    expect(r.subject).toContain("cancelled");
    expect(r.text).toContain("has been cancelled");
    expect(r.html).toContain("Arthur");
  });

  it("leaves no unresolved tokens or conditional markers in output", async () => {
    const r = await renderEmail("roster_shift_change", { ...baseTokens, ADDED: "1", REMOVED: "" });
    expect(r.subject).not.toMatch(/\{\{/);
    expect(r.html).not.toMatch(/\{\{/);
    expect(r.text).not.toMatch(/\{\{/);
  });
});
