import { describe, expect, it } from "vitest";

import {
  COMPLAINT_MAX_ATTACHMENTS,
  COMPLAINT_MAX_ATTACHMENT_BYTES,
  isAllowedImage,
  makeDraftSnapshot,
  restoreDraftSnapshot,
  validateComplaintWizardDraft,
  type ComplaintWizardDraft,
} from "./wizard";

const CATEGORY_ID = "33333333-3333-4333-8333-333333333333";
const NOW = new Date("2026-08-10T00:00:00.000Z");

const draft = (overrides: Partial<ComplaintWizardDraft> = {}): ComplaintWizardDraft => ({
  categoryId: CATEGORY_ID,
  categoryUncertain: false,
  title: "Street light is out",
  description: "The street light near the community entrance is not working.",
  attachments: [],
  location: { text: "Community entrance" },
  citizenName: "Synthetic Citizen",
  phone: "081-234-5678",
  notifyChannel: "LINE",
  consentAccepted: true,
  consentVersion: "privacy-2026-01",
  ...overrides,
});

describe("complaint wizard contract", () => {
  it("requires exactly one of category and uncertain", () => {
    expect(validateComplaintWizardDraft(draft({ categoryId: undefined, categoryUncertain: false }), 1)).toHaveLength(1);
    expect(validateComplaintWizardDraft(draft({ categoryId: CATEGORY_ID, categoryUncertain: true }), 1)).toHaveLength(1);
    expect(validateComplaintWizardDraft(draft({ categoryId: undefined, categoryUncertain: true }), 1)).toHaveLength(0);
  });

  it("validates required text and bounded attachments/location", () => {
    const errors = validateComplaintWizardDraft(draft({
      title: "",
      description: "",
      attachments: Array.from({ length: COMPLAINT_MAX_ATTACHMENTS + 1 }, (_, index) => ({
        id: String(index),
        fileName: `photo-${index}.jpg`,
        contentType: "image/jpeg",
        byteLength: 100,
        state: "QUARANTINED" as const,
      })),
      location: { latitude: 13.7 },
    }), 2);
    expect(errors.map((error) => error.field)).toEqual(expect.arrayContaining(["title", "description", "attachments", "location"]));
  });

  it("requires consent and phone when phone notification is selected", () => {
    const errors = validateComplaintWizardDraft(draft({ phone: "", notifyChannel: "PHONE", consentAccepted: false }), 3);
    expect(errors.map((error) => error.field)).toEqual(expect.arrayContaining(["phone", "consentAccepted"]));
  });

  it("accepts the complete draft and rejects invalid phone data", () => {
    expect(validateComplaintWizardDraft(draft(), 4)).toHaveLength(0);
    expect(validateComplaintWizardDraft(draft({ phone: "not-a-phone" }), 4).map((error) => error.field)).toContain("phone");
  });

  it("creates a minimized resumable snapshot without phone, consent, or file bytes", () => {
    const snapshot = makeDraftSnapshot(draft({ attachments: [{ id: "a", fileName: "photo.jpg", contentType: "image/jpeg", byteLength: 42, state: "QUARANTINED" }] }), 2, NOW);
    expect(snapshot).toMatchObject({ version: 1, step: 2, attachmentNames: ["photo.jpg"], citizenName: "Synthetic Citizen" });
    expect(snapshot).not.toHaveProperty("phone");
    expect(snapshot).not.toHaveProperty("consentAccepted");
    expect(restoreDraftSnapshot(snapshot)).toMatchObject({ title: "Street light is out", notifyChannel: "LINE" });
  });

  it("fails closed when a stored snapshot is malformed", () => {
    expect(restoreDraftSnapshot(null)).toBeUndefined();
    expect(restoreDraftSnapshot({ version: 2, title: "x", description: "y" })).toBeUndefined();
    expect(restoreDraftSnapshot({ version: 1, savedAt: "bad", title: "x", description: "y", categoryUncertain: false, citizenName: "x", notifyChannel: "LINE" })).toBeUndefined();
  });

  it("allows only bounded image types for client-side preflight", () => {
    expect(isAllowedImage("image/jpeg", 100)).toBe(true);
    expect(isAllowedImage("image/png", COMPLAINT_MAX_ATTACHMENT_BYTES)).toBe(true);
    expect(isAllowedImage("image/svg+xml", 100)).toBe(false);
    expect(isAllowedImage("image/jpeg", COMPLAINT_MAX_ATTACHMENT_BYTES + 1)).toBe(false);
  });
});
