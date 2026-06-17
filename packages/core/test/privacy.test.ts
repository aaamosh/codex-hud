import { describe, expect, it } from "vitest";
import { decryptEmail, encryptEmail, hashEmail, isValidEmail, maskEmail, normalizeEmail } from "../src";

describe("privacy helpers", () => {
  it("normalizes, validates, masks, hashes, and encrypts email", async () => {
    expect(normalizeEmail(" Alice@Example.COM ")).toBe("alice@example.com");
    expect(isValidEmail("alice@example.com")).toBe(true);
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(maskEmail("alice@example.com")).toBe("al***e@e***e.com");

    const hashA = await hashEmail("Alice@Example.COM", "pepper");
    const hashB = await hashEmail(" alice@example.com ", "pepper");
    expect(hashA).toBe(hashB);
    expect(hashA).toHaveLength(64);

    const ciphertext = await encryptEmail("Alice@Example.COM", "secret");
    expect(ciphertext).toMatch(/^v1:/);
    await expect(decryptEmail(ciphertext, "secret")).resolves.toBe("alice@example.com");
    await expect(decryptEmail(ciphertext, "wrong")).rejects.toThrow();
  });
});

