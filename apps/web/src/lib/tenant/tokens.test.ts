import { describe, expect, it } from "vitest";

import { generateInvitationToken, hashInvitationToken, hashOnboardingPayload } from "./tokens";

describe("invitation and onboarding tokens", () => {
  it("generates high-entropy tokens and stable hashes", () => {
    const token = generateInvitationToken();
    expect(token.length).toBeGreaterThanOrEqual(32);
    expect(hashInvitationToken(token)).toHaveLength(64);
    expect(hashInvitationToken(token)).toBe(hashInvitationToken(token));
    expect(hashInvitationToken(token)).not.toBe(hashInvitationToken(`${token}x`));
  });

  it("hashes onboarding payloads by normalized content", () => {
    const a = hashOnboardingPayload({
      displayName: " Stall ",
      timezone: "Asia/Colombo",
      marketLocation: " Pettah ",
    });
    const b = hashOnboardingPayload({
      displayName: "Stall",
      timezone: "Asia/Colombo",
      marketLocation: "Pettah",
    });
    const c = hashOnboardingPayload({
      displayName: "Stall",
      timezone: "Asia/Colombo",
      marketLocation: "Other",
    });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});
