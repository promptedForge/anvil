const AWARENESS_LEADS = Object.freeze({
  unaware: "Curiosity",
  problem: "Pain or Curiosity",
  solution: "Curiosity or Promise",
  product: "Promise or Proof",
  most: "a real Conditions term when one exists, otherwise Promise",
  default: "the strongest grounded block for the selected template",
});

const PLATFORM_SPECS = Object.freeze({
  Facebook: Object.freeze({
    kind: "feed",
    placement: "Facebook feed ad",
    firstSegmentMaxChars: 125,
    wordRanges: Object.freeze({
      unaware: [70, 110],
      problem: [55, 90],
      solution: [45, 80],
      product: [35, 65],
      most: [20, 45],
      default: [45, 85],
    }),
    formatRule: "Use one to three short paragraphs that read naturally in a Facebook feed.",
  }),
  Instagram: Object.freeze({
    kind: "feed",
    placement: "Instagram feed ad",
    firstSegmentMaxChars: 125,
    wordRanges: Object.freeze({
      unaware: [45, 75],
      problem: [35, 65],
      solution: [30, 60],
      product: [25, 50],
      most: [15, 35],
      default: [30, 60],
    }),
    formatRule: "Use one to three compact paragraphs with a visual, mobile-first rhythm.",
  }),
  LinkedIn: Object.freeze({
    kind: "feed",
    placement: "LinkedIn sponsored feed ad",
    firstSegmentMaxChars: 150,
    wordRanges: Object.freeze({
      unaware: [80, 140],
      problem: [65, 120],
      solution: [55, 105],
      product: [40, 85],
      most: [25, 55],
      default: [55, 105],
    }),
    formatRule: "Use one to three short paragraphs in a professional, specific voice. Lead with an operational insight, business problem, or substantiated outcome rather than consumer hype.",
  }),
  TikTok: Object.freeze({
    kind: "video",
    placement: "TikTok vertical video ad",
    firstSegmentMaxChars: 100,
    wordRanges: Object.freeze({
      unaware: [75, 115],
      problem: [65, 105],
      solution: [55, 95],
      product: [45, 80],
      most: [25, 55],
      default: [55, 95],
    }),
    formatRule: "Write a spoken vertical-video script in short, natural beats. primaryText is the spoken script and the first segment is the opening on-screen hook.",
  }),
  "YouTube Shorts": Object.freeze({
    kind: "video",
    placement: "YouTube Shorts vertical video ad",
    firstSegmentMaxChars: 100,
    wordRanges: Object.freeze({
      unaware: [75, 115],
      problem: [65, 105],
      solution: [55, 95],
      product: [45, 80],
      most: [25, 55],
      default: [55, 95],
    }),
    formatRule: "Write a spoken vertical-video script in short, natural beats. primaryText is the spoken script and the first segment is the opening on-screen hook.",
  }),
  "Google Search": Object.freeze({
    kind: "search",
    placement: "Google Responsive Search Ad",
  }),
});

export const PLATFORMS = Object.freeze(Object.keys(PLATFORM_SPECS));
export const FEED = Object.freeze(
  PLATFORMS.filter((platform) => PLATFORM_SPECS[platform].kind === "feed"),
);

export function getPlatformSpec(platform) {
  const spec = PLATFORM_SPECS[platform];
  if (!spec) throw new Error(`Unsupported ad platform: ${platform}`);
  return spec;
}

export function isFeedPlatform(platform) {
  return getPlatformSpec(platform).kind === "feed";
}

export function isSearchPlatform(platform) {
  return getPlatformSpec(platform).kind === "search";
}

export function getPrimaryTextExampleBlock(awareness = "", hasConditions = false, templateLeadBlock = "Curiosity", hasProof = false) {
  if (awareness === "problem") return "Pain";
  if (awareness === "solution" || awareness === "unaware") return "Curiosity";
  if (awareness === "product") return "Promise";
  if (awareness === "most") return hasConditions ? "Conditions" : "Promise";
  if (templateLeadBlock === "Proof" && !hasProof) return "Promise";
  if (templateLeadBlock === "Conditions" && !hasConditions) return "Promise";
  return ["Pain", "Promise", "Proof", "Constraints", "Curiosity", "Conditions"].includes(templateLeadBlock)
    ? templateLeadBlock
    : "Curiosity";
}

export function buildPlacementGuidance(platform, awareness = "") {
  const spec = getPlatformSpec(platform);
  if (spec.kind === "search") {
    return "This is a Google Responsive Search Ad. Use the dedicated search asset contract.";
  }

  const range = spec.wordRanges[awareness] || spec.wordRanges.default;
  const lead = AWARENESS_LEADS[awareness] || AWARENESS_LEADS.default;
  return `${spec.placement}. ${spec.formatRule}
PRIMARY TEXT CONTRACT:
- Use one to three coherent segments total. Aim for ${range[0]} to ${range[1]} words across all segments.
- Begin with ${lead}. The first segment must be a complete thought of ${spec.firstSegmentMaxChars} characters or fewer.
- Use only the copy blocks that add distinct information. A segment may combine compatible blocks; label it with its dominant block.
- State each material idea and claim once. Cut paraphrased restatements, repeated setup, throat-clearing, and summary sentences that repeat the body.
- Keep every factual claim, proof point, deadline, guarantee, offer term, and urgency cue grounded in supplied material. Omit any unsupported element.`;
}

export function formatCopyBlocks(blocks, blockNames) {
  const names = Array.isArray(blockNames) && blockNames.length > 0
    ? blockNames
    : ["Pain", "Promise", "Proof", "Constraints", "Curiosity", "Conditions"];
  const hasAny = names.some((name) => String(blocks?.[name] || "").trim());

  if (!hasAny) {
    return "Pain, Promise, Constraints, and Curiosity may be inferred from the offer, persona, avatar, and awareness stage. Proof and Conditions are absent: omit them unless supplied facts explicitly support them.";
  }

  return names.map((name) => {
    const value = String(blocks?.[name] || "").trim();
    if (value) return `${name}: ${value}`;
    if (name === "Proof" || name === "Conditions") {
      return `${name}: (absent; omit rather than invent or imply)`;
    }
    return `${name}: (infer only from the offer, persona, avatar, and awareness stage)`;
  }).join("\n");
}

export function toAdExportRecord(result) {
  const primaryTextSegments = Array.isArray(result?.primaryText)
    ? result.primaryText.filter((segment) => segment && segment.text)
    : [];
  return {
    personaName: result?.personaName || "",
    awarenessStage: result?.awarenessLabel || "",
    angleFamily: result?.angleFamily || "",
    angleSubtype: result?.angleSubtype || "",
    headline: result?.headline || "",
    primaryText: primaryTextSegments.map((segment) => segment.text).join("\n\n"),
    primaryTextSegments: primaryTextSegments.map((segment) => ({
      block: segment.block || "",
      text: segment.text,
    })),
    cta: result?.cta || "",
    description: result?.description || "",
    platform: result?.platform || "",
    imageHeadline: result?.imageHeadline || "",
    imageSubline: result?.imageSubline || "",
    creativeBrief: result?.creativeBrief || "",
  };
}
