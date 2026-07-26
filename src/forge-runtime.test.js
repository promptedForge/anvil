import { describe, expect, it } from "vitest";
import {
  extractAnvilGenerationOutput,
  normalizeAnvilGenerationRequest,
} from "./forge-runtime";

describe("Anvil Forge runtime request", () => {
  it("keeps provider selection out of the client request", () => {
    const request = normalizeAnvilGenerationRequest(
      "Write one ad.",
      1800,
      null,
      "00000000-0000-4000-8000-000000000001",
    );
    expect(request).toEqual({
      requestId: "00000000-0000-4000-8000-000000000001",
      prompt: "Write one ad.",
      maxTokens: 1800,
    });
    expect(request).not.toHaveProperty("model");
    expect(request).not.toHaveProperty("provider");
    expect(request).not.toHaveProperty("api_key");
  });

  it("normalizes legacy text blocks into provider-neutral system guidance", () => {
    expect(
      normalizeAnvilGenerationRequest("Write one ad.", 5000, [
        {
          type: "text",
          text: "Keep claims grounded.",
          cache_control: { type: "ephemeral" },
        },
      ], "00000000-0000-4000-8000-000000000002"),
    ).toEqual({
      requestId: "00000000-0000-4000-8000-000000000002",
      prompt: "Write one ad.",
      maxTokens: 4096,
      system: "Keep claims grounded.",
    });
  });

  it("fails closed on empty or oversized prompts", () => {
    expect(() => normalizeAnvilGenerationRequest("")).toThrow(
      "A generation prompt is required.",
    );
    expect(() => normalizeAnvilGenerationRequest("x".repeat(20001))).toThrow(
      "The generation prompt is too long.",
    );
  });

  it("accepts only the native Forge output response contract", () => {
    expect(extractAnvilGenerationOutput({ output: "Draft ready." })).toBe(
      "Draft ready.",
    );
    expect(() => extractAnvilGenerationOutput({ text: "legacy" })).toThrow(
      "Forge returned an invalid generation response.",
    );
  });
});
