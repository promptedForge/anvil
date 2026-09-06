import { describe, expect, it } from "vitest";
import {
  FEED,
  PLATFORMS,
  buildPlacementGuidance,
  formatCopyBlocks,
  getPrimaryTextExampleBlock,
  getPlatformSpec,
  isFeedPlatform,
  isSearchPlatform,
  toAdExportRecord,
} from "./ad-platforms.js";

describe("Anvil ad platform contract", () => {
  it("routes LinkedIn as a feed platform and keeps Google on the search path", () => {
    expect(PLATFORMS).toEqual([
      "Facebook",
      "Instagram",
      "LinkedIn",
      "TikTok",
      "YouTube Shorts",
      "Google Search",
    ]);
    expect(FEED).toEqual(["Facebook", "Instagram", "LinkedIn"]);
    expect(isFeedPlatform("LinkedIn")).toBe(true);
    expect(isSearchPlatform("Google Search")).toBe(true);
    expect(() => getPlatformSpec("Google")).toThrow("Unsupported ad platform");
  });

  it("gives Facebook one coherent, awareness-led primary-text contract", () => {
    const guidance = buildPlacementGuidance("Facebook", "product");
    expect(guidance).toContain("Facebook feed ad");
    expect(guidance).toContain("Begin with Promise or Proof");
    expect(guidance).toContain("Use one to three coherent segments total");
    expect(guidance).toContain("Aim for 35 to 65 words");
    expect(guidance).toContain("State each material idea and claim once");
    expect(guidance).toContain("A segment may combine compatible blocks");
    expect(guidance).not.toContain("each carrying ONE block");
    expect(guidance).not.toContain("FIRST segment MUST be the Curiosity hook");
  });

  it("does not force every output schema to begin with Curiosity", () => {
    expect(getPrimaryTextExampleBlock("unaware")).toBe("Curiosity");
    expect(getPrimaryTextExampleBlock("problem")).toBe("Pain");
    expect(getPrimaryTextExampleBlock("product")).toBe("Promise");
    expect(getPrimaryTextExampleBlock("most", false)).toBe("Promise");
    expect(getPrimaryTextExampleBlock("most", true)).toBe("Conditions");
    expect(getPrimaryTextExampleBlock("", false, "Pain")).toBe("Pain");
    expect(getPrimaryTextExampleBlock("", false, "Proof", false)).toBe("Promise");
    expect(getPrimaryTextExampleBlock("", false, "Proof", true)).toBe("Proof");
    expect(getPrimaryTextExampleBlock("", false, "unknown")).toBe("Curiosity");
  });

  it("gives LinkedIn a professional feed shape without weakening source safety", () => {
    const guidance = buildPlacementGuidance("LinkedIn", "solution");
    expect(guidance).toContain("LinkedIn sponsored feed ad");
    expect(guidance).toContain("professional, specific voice");
    expect(guidance).toContain("Use one to three short paragraphs");
    expect(guidance).toContain("Begin with Curiosity or Promise");
    expect(guidance).toContain("Omit any unsupported element");
    expect(guidance).not.toContain("two to four");
  });

  it("marks absent proof and terms as omissions instead of inference targets", () => {
    const formatted = formatCopyBlocks(
      { Pain: "A real pain", Promise: "", Proof: "", Constraints: "", Curiosity: "", Conditions: "" },
      ["Pain", "Promise", "Proof", "Constraints", "Curiosity", "Conditions"],
    );
    expect(formatted).toContain("Pain: A real pain");
    expect(formatted).toContain("Proof: (absent; omit rather than invent or imply)");
    expect(formatted).toContain("Conditions: (absent; omit rather than invent or imply)");
  });

  it("exports LinkedIn and the receiving fields without losing segmented copy", () => {
    expect(toAdExportRecord({
      platform: "LinkedIn",
      personaName: "Operations leader",
      awarenessLabel: "Solution-aware",
      angleFamily: "analytical",
      angleSubtype: "Diagnostic",
      headline: "See the bottleneck",
      primaryText: [
        { block: "Curiosity", text: "One operational question." },
        { block: "Proof", text: "A supplied proof point." },
      ],
      cta: "Learn More",
      description: "Review the workflow",
    })).toMatchObject({
      platform: "LinkedIn",
      personaName: "Operations leader",
      angleFamily: "analytical",
      angleSubtype: "Diagnostic",
      primaryText: "One operational question.\n\nA supplied proof point.",
      primaryTextSegments: [
        { block: "Curiosity", text: "One operational question." },
        { block: "Proof", text: "A supplied proof point." },
      ],
    });
  });
});
