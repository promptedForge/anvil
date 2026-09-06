import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");

describe("Anvil App platform integration", () => {
  it("applies the platform contract to both single-ad and A/B generation", () => {
    expect(appSource.match(/buildPlacementGuidance\(platform, intake\.awareness\)/g)).toHaveLength(2);
    expect(appSource).toContain("getPrimaryTextExampleBlock(intake.awareness");
    expect(appSource).not.toContain('"block":"Curiosity","text":"..."');
    expect(appSource).not.toContain("FIRST segment MUST be the Curiosity hook");
    expect(appSource).not.toContain("each carrying ONE block");
  });

  it("does not invent a free lead-generation offer when the field is empty", () => {
    expect(appSource).toContain("No lead magnet or next-step offer was supplied");
    expect(appSource).toContain("Use a neutral Learn More or Contact Us CTA");
    expect(appSource).not.toContain("a free consult / inspection / quote");
    expect(appSource).not.toContain("For lead generation the CTA is the free");
  });

  it("keeps seller proof separate from audience proof preferences", () => {
    expect(appSource).toContain("PROOF SUPPLIED BY THE SELLER");
    expect(appSource).toContain("Audience proof preferences in the avatar describe what would be persuasive");
    expect(appSource).toContain("Omit Proof or Conditions when they are absent");
    expect(appSource.match(/Template labels describe rhetorical shape only/g)).toHaveLength(2);
    expect(appSource).not.toContain("use ONLY proofTrusted");
    expect(appSource).not.toContain("PROOF THE MARKET TRUSTS (you have)");
  });

  it("mounts the Forge-projected extension surface into the existing workspace", () => {
    expect(appSource).toContain('import AnvilMarketwareExtensions from "./AnvilMarketwareExtensions.jsx"');
    expect(appSource).toContain("<AnvilMarketwareExtensions");
    expect(appSource).toContain("selectedPlatform={platform}");
    expect(appSource).toContain("onSelectPlatform={setPlatform}");
    expect(appSource).toContain("draftContext={{ objective: intake.objective, audience: intake.audience, offer: intake.offer }}");
    expect(appSource).toContain('id="anvil-generator-workspace"');
    expect(appSource).toContain("Meta, LinkedIn, TikTok, YouTube Shorts, and Google Search");
  });

  it("routes feed preview and export through the shared platform helpers", () => {
    expect(appSource).toContain("const isFeed = isFeedPlatform(r.platform)");
    expect(appSource).toContain("const isLinkedIn = r.platform === \"LinkedIn\"");
    expect(appSource).toContain("const exportRecord = toAdExportRecord(r)");
    expect(appSource).toContain("Copy JSON");
    expect(appSource).toContain("angleFamily: selectedAngle.family");
    expect(appSource).toContain('applyCuriosityAngle(a.angle, a.familyId, a.subtype)');
    expect(appSource).toContain("ANGLE FAMILY:");
    expect(appSource).toContain("ANGLE SUBTYPE:");
  });
});
