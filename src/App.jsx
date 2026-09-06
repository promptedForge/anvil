import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  forgeRuntimeConfigured,
  getForgeSession,
  onForgeAuthStateChange,
  requestForgeGeneration,
  signInToForge,
  signOutOfForge,
} from "./forge-runtime";
import AnvilMarketwareExtensions from "./AnvilMarketwareExtensions.jsx";
import {
  PLATFORMS,
  buildPlacementGuidance,
  formatCopyBlocks,
  getPrimaryTextExampleBlock,
  isFeedPlatform,
  isSearchPlatform,
  toAdExportRecord,
} from "./ad-platforms.js";

/*
  ANVIL  by Prompted Forge  (v6)
  Adds campaign objective + responsive search ads.

  - Objective: Lead generation or Direct sale. In lead-gen mode the CTA and the
    Conditions block use the supplied next step. If none is supplied, generation
    stays neutral instead of inventing an offer.
  - Google Search now outputs a real responsive search ad: up to 15 headlines
    and 4 descriptions with character-limit checks and a SERP preview, instead
    of one headline and one description.

  Pipeline: paste market language -> research pass -> quote-backed avatar ->
  six blocks -> template -> ad / A/B test set / search asset set, per placement.
*/

const BLOCKS = {
  Pain:        { color: "#E8242B", tint: "#FBE4E5", ink: "#7A0E12", desc: "The thing they DON'T want. The cost of staying stuck.", method: "layered pain" },
  Promise:     { color: "#1B7A43", tint: "#E1F1E7", ink: "#0C3D21", desc: "The thing they DO want. The promised land.", method: "promise ladder" },
  Proof:       { color: "#1B79B5", tint: "#E2EEF6", ink: "#0C3A57", desc: "A reason to believe the promise is real.", method: "proof match" },
  Constraints: { color: "#5F6368", tint: "#EBECED", ink: "#2E3134", desc: "The belief or objection that holds them back.", method: "acknowledge and reframe" },
  Curiosity:   { color: "#B8BB1E", tint: "#F6F7DA", ink: "#5C5E0F", desc: "The new idea that bridges pain and promise. Hooks live here.", method: "fresh angle + insight level" },
  Conditions:  { color: "#8E3B8E", tint: "#F2E4F2", ink: "#4A1E4A", desc: "Qualifier, scarcity, risk reversal, bonus, terms. The CTA wrapper.", method: "offer wrapper" },
};
const BLOCK_NAMES = Object.keys(BLOCKS);

const TEMPLATES = [
  { id: 1, name: "The Before & After", when: "Sharp contrast between a painful state and a dramatically better result.", leadBlock: "Promise", opening: "Transformation contrast hook", middle: "Vivid pain state + transformation + proof", close: "Bold promise + CTA" },
  { id: 2, name: "The Insider Reveal", when: "You have hidden or exclusive information most people don't have.", leadBlock: "Curiosity", opening: "Exclusivity curiosity hook", middle: "Hidden information + proof", close: "Promise + CTA" },
  { id: 3, name: "The Framework", when: "Market is overwhelmed by complexity and wants a clear structured path.", leadBlock: "Constraints", opening: "Complexity contrast hook", middle: "Simplicity promise + system curiosity", close: "Proof + CTA" },
  { id: 4, name: "The Quick Win", when: "You can promise a fast, tangible result that builds momentum.", leadBlock: "Promise", opening: "Speed-result contrast hook", middle: "Proof + mechanism curiosity", close: "Clear path + CTA" },
  { id: 5, name: "The Industry Authority", when: "Buyer works hard but lacks recognition and wants status.", leadBlock: "Proof", opening: "Recognition gap hook", middle: "Authority promise + benefits", close: "Timeframe + easy action CTA" },
  { id: 6, name: "The Hidden Cost", when: "An invisible loss is draining the buyer's time, money, or potential.", leadBlock: "Pain", opening: "Invisible pain hook", middle: "Cost revelation + solution promise", close: "Proof + urgent CTA" },
  { id: 7, name: "The Identity Shift", when: "The buyer's self-image is blocking their results.", leadBlock: "Constraints", opening: "Identity crisis hook", middle: "Identity contrast + transformation", close: "Proof + identity CTA" },
  { id: 8, name: "The Pattern Interrupt Question", when: "Attack a deeply held belief with one shocking question.", leadBlock: "Curiosity", opening: "Perspective-shattering question", middle: "True problem revealed + solution", close: "Proof + urgency CTA" },
  { id: 9, name: "The Overlooked Factor", when: "A missing piece explains why the buyer stays stuck despite effort.", leadBlock: "Curiosity", opening: "Missing element hook", middle: "Unexpected cause + solution promise", close: "Proof + simple-solution CTA" },
  { id: 10, name: "The Bottleneck Breakthrough", when: "One specific obstacle is why everything else has failed.", leadBlock: "Pain", opening: "Bottleneck revelation hook", middle: "Breakthrough solution + transformation", close: "Proof + obstacle-removing CTA" },
  { id: 11, name: "The Effortless Pivot", when: "One tiny change unlocks outsized results.", leadBlock: "Promise", opening: "Tiny-change-big-result hook", middle: "Simplicity proof + mechanism hint", close: "Effortless implementation + CTA" },
  { id: 12, name: "The Future Self Regret Minimizer", when: "Project the buyer forward to a decision they'll regret.", leadBlock: "Pain", opening: "Future reflection hook", middle: "Decision fork + regret contrast", close: "Legacy choice + CTA" },
  { id: 13, name: "The Insider-Outsider Contrast", when: "Expose the gap between how elites solve this and how others struggle.", leadBlock: "Curiosity", opening: "Elite practice contrast hook", middle: "Insider access + exclusive method", close: "Identity elevation + CTA" },
  { id: 14, name: "The Resource Maximizer", when: "Buyer is short on a scarce resource and wants more from less.", leadBlock: "Constraints", opening: "Resource constraint hook", middle: "Efficiency promise + proof", close: "Mechanism curiosity + CTA" },
];

const CTA_OPTIONS = ["Learn More", "Sign Up", "Get Offer", "Shop Now", "Subscribe", "Download", "Contact Us", "Book Now", "Get Quote"];
const LEADGEN_CTAS = ["Book Now", "Get Quote", "Sign Up", "Contact Us", "Learn More", "Get Offer"];
const SALES_CTAS = ["Shop Now", "Sign Up", "Subscribe", "Download", "Get Offer", "Learn More"];
const OBJECTIVES = ["Lead generation", "Direct sale"];
// Awareness stage, the five rungs. Optional campaign setting: changes format/length
// and which block leads, per the awareness spec. Empty means not set, generation
// falls back to today's behavior with no awareness-specific guidance.
const AWARENESS_STAGES = [
  { id: "unaware", label: "Unaware", desc: "Does not know they have the problem.", guidance: "Lead with the Curiosity reframe, a discovery that surfaces the hidden problem or opportunity. Hold the offer and the Conditions block back, this is not the place for a hard CTA. Favor a slightly longer, story-led opening over a short direct pitch." },
  { id: "problem", label: "Problem-aware", desc: "Feels the problem, does not know the solutions.", guidance: "Lead with Pain, naming the problem the way this market actually feels it, then move them toward your view of the root cause. Curiosity can introduce the mechanism. Keep the CTA soft, more learn-more than buy-now." },
  { id: "solution", label: "Solution-aware", desc: "Knows solution types, not your offer.", guidance: "Lead with Curiosity or Promise, establishing why this specific approach is the right one, differentiated from other solution types they already know about. Proof should carry real weight here." },
  { id: "product", label: "Product-aware", desc: "Knows your offer, not yet convinced.", guidance: "Lead with Promise or Proof, making this specific offer the obvious choice and building trust in it by name. The Constraints block should address the specific hesitation about choosing you, not the category." },
  { id: "most", label: "Most aware", desc: "Ready, needs the deal and the call to action.", guidance: "Lead with the offer and any supplied Conditions. Be short and direct, most of the six blocks can compress or drop away. The call to action should be immediate and specific. Any urgency must be real, never manufactured." },
];
// Vertical language and compliance rules, extracted from the engine into a
// standalone config, per Breyden's call in START_HERE_Segment_Builder.md:
// keep these out of the hardcoded prompt strings, shaped so Anvil can later
// read a shared vertical language profile from the Forge Market substrate
// without changing how voiceLine()/complianceLine() consume it. Three
// buckets per profile, matching that instruction's own wording: the allowed
// and forbidden words (forbiddenTerms/forbiddenFrames), the tone (tone/
// styleNotes), and the voice caps (insightRange/claimsRule).

// Hard rules that apply to every voice and every generation prompt, not a
// per-vertical style choice. Per CLAUDE.md: no em-dashes ever, never the
// contrastive negation-then-restate construction. Kept separate from the
// per-voice profiles below since a shared substrate profile would not need
// to repeat these per vertical.
const UNIVERSAL_SURFACE_RULES = [
  "No em-dashes.",
  "Never use the contrastive negation-then-restate construction (any subject, not just 'it': '[X] is not A, [it/that/X] is B', in one sentence or split across two sentences, such as '[X] is not A. It is B.').",
  "Never invent statistics, studies, authorities, testimonials, credentials, professional consensus, urgency, scarcity, guarantees, deadlines, or offer terms.",
  "If proof, a condition, or a factual detail was not supplied, omit it or identify the gap in the creative brief instead of filling it with a plausible claim.",
];

const VERTICAL_LANGUAGE_PROFILES = {
  "Plain & credible": {
    tag: "local SMBs, trust markets",
    tone: "plain, calm, and credible",
    styleNotes: "Write at a fifth-grade reading level in short declarative sentences. Be concrete and specific.",
    leadWith: "proof, time saved, and money or leads gained, not hype",
    forbiddenTerms: ["manufactured urgency or fake scarcity", "hype superlatives, clickbait, taboo, or shock framing"],
    forbiddenFrames: ["Taboo Solution frames", "shock or taboo characterizations", "idea caricatures"],
    insightRange: [5, 7], insightLabel: "credible",
    claimsRule: "medical, legal, financial, or income claims you cannot substantiate",
  },
  "Ambitious & direct": {
    tag: "operators, agency builders",
    tone: "ambitious, direct, and credible, for an audience that is tired of gurus and burned by courses that never shipped",
    styleNotes: "Energy is welcome, hype is not. Every bold promise must be backed by specific proof. Favor real mechanics and specifics over spectacle.",
    leadWith: "",
    forbiddenTerms: ["guru cliches (no 'six figures while you sleep', no 'secret loophole')"],
    forbiddenFrames: ["Taboo Solution frames", "shock characterizations"],
    insightRange: [6, 8], insightLabel: "provable",
    claimsRule: "",
  },
  "Raw direct-response": {
    tag: "supplements, info, not local",
    tone: "classic aggressive direct-response, high curiosity and bold promises",
    styleNotes: "Use only where the market expects it. Not appropriate for local services, health, legal, or finance.",
    leadWith: "",
    forbiddenTerms: [],
    forbiddenFrames: [],
    insightRange: [6, 9], insightLabel: "",
    claimsRule: "",
  },
};

// Composes the same kind of prompt-ready rule text the old hardcoded strings
// held, from the structured profile above. Behavior should read the same to
// the model, the data just is not one hardcoded paragraph anymore.
function composeVoiceRule(profile) {
  const bits = [`VOICE: ${profile.tone}.`];
  if (profile.styleNotes) bits.push(profile.styleNotes);
  if (profile.leadWith) bits.push(`Lead with ${profile.leadWith}.`);
  (profile.forbiddenTerms || []).forEach((t) => bits.push(`No ${t}.`));
  bits.push(...UNIVERSAL_SURFACE_RULES);
  if (profile.insightRange) bits.push(`Keep Curiosity at a ${profile.insightLabel || "credible"} insight level (insight level about ${profile.insightRange[0]} to ${profile.insightRange[1]}), never outlandish.`);
  if (profile.claimsRule) bits.push(`Make no ${profile.claimsRule}.`);
  if (profile.forbiddenFrames && profile.forbiddenFrames.length) bits.push(`No ${profile.forbiddenFrames.join(", ")}.`);
  return bits.join(" ");
}

// Same idea for the regulated-vertical compliance rule: structured profile,
// composed into the prompt text, instead of one hardcoded string.
const COMPLIANCE_PROFILE = {
  verticals: ["health", "legal", "finance"],
  forbiddenClaims: ["medical", "legal", "financial", "income"],
  forbiddenContent: ["cures", "outcome guarantees", "before-and-after health imagery"],
  substantiationRule: "State only what can be substantiated.",
  sellInstead: "the free next step, not the result",
  curiosityRule: "Keep curiosity credible, with no taboo or shock framing.",
  reviewRule: "All output will be human-reviewed before spend.",
};
function composeComplianceLine(profile) {
  return `\nCOMPLIANCE: This is a regulated vertical (${profile.verticals.join(", ")}). Make no ${profile.forbiddenClaims.join(", ")} claims. No ${profile.forbiddenContent.join(", ")}. ${profile.substantiationRule} Sell ${profile.sellInstead}. ${profile.curiosityRule} ${profile.reviewRule}`;
}
const AXES = ["Hook", "Headline", "Image headline", "CTA", "Angle (big idea)"];

// Proof engine: 22 proof types across 5 categories, ranked by how hard each is to
// fake (harder to fake reads as stronger). Psychological types are flagged as
// underused, per the framework, not weak, just rarely reached for.
const PROOF_TYPES = [
  { id: "live-demo", category: "Experiential", name: "Live demo", desc: "Let them see or hear it working right now, on a real example.", strength: 5 },
  { id: "free-trial", category: "Experiential", name: "Free trial or sample", desc: "Let them experience the result themselves before paying.", strength: 4 },
  { id: "money-back", category: "Experiential", name: "Money-back guarantee", desc: "Risk reversal that proves you believe in the result.", strength: 4 },
  { id: "on-site-proof", category: "Experiential", name: "On-site or in-person proof", desc: "They can see it happening at their own location.", strength: 4 },
  { id: "interactive-tool", category: "Experiential", name: "Interactive calculator or tool", desc: "They plug in their own numbers and see their own proof.", strength: 4 },
  { id: "before-after", category: "Experiential", name: "Before-and-after", desc: "A visible change over time. Easy to cherry-pick, so it carries less weight than it looks like it should.", strength: 3 },
  { id: "case-study", category: "Empirical", name: "Case study with numbers", desc: "One specific, documented result with real figures.", strength: 4 },
  { id: "third-party-data", category: "Empirical", name: "Third-party study or data", desc: "A source outside the business backs the claim.", strength: 4 },
  { id: "track-record", category: "Empirical", name: "Track record or volume stats", desc: "Years in business, number served, aggregate outcomes.", strength: 3 },
  { id: "certification", category: "Credible", name: "Certification, license, or accreditation", desc: "A credential a regulator or board actually issues.", strength: 4 },
  { id: "partnership", category: "Credible", name: "Partnership or official affiliation", desc: "Manufacturer-authorized, insurance-approved, or similar.", strength: 4 },
  { id: "professional-credentials", category: "Credible", name: "Professional credentials of the person delivering it", desc: "Who is actually doing the work, and what they are qualified to do.", strength: 4 },
  { id: "awards", category: "Credible", name: "Awards or industry recognition", desc: "Third-party recognition, not a self-issued badge.", strength: 3 },
  { id: "media", category: "Credible", name: "Media mentions or press coverage", desc: "Independent coverage, not paid placement.", strength: 3 },
  { id: "testimonials", category: "Social", name: "Testimonials or reviews", desc: "Star ratings and quoted reviews. Common and easy to discount, pair with something harder to fake for a big claim.", strength: 2 },
  { id: "referral", category: "Social", name: "Referral or word-of-mouth signal", desc: "How new customers say they found you.", strength: 3 },
  { id: "community", category: "Social", name: "Visible community or user base", desc: "Active reviews, visible activity, a real audience.", strength: 3 },
  { id: "authority-transfer", category: "Psychological", name: "Authority transfer", desc: "An expert or credentialed figure vouches for it.", strength: 2, underused: true },
  { id: "social-consensus", category: "Psychological", name: "Social proof or consensus", desc: "Enough other people are already doing this that it feels safe.", strength: 1, underused: true },
  { id: "similarity-proof", category: "Psychological", name: "Similarity proof", desc: "Someone just like the reader got the result.", strength: 2, underused: true },
  { id: "founder-story", category: "Psychological", name: "Founder story or origin credibility", desc: "The person behind the offer has lived the problem firsthand.", strength: 2, underused: true },
  { id: "scarcity-signal", category: "Psychological", name: "Scarcity-backed proof", desc: "Limited availability that reflects real demand, not manufactured urgency.", strength: 1, underused: true },
];
// Curiosity Quadrant: two axes, market view vs your view, and problem vs solution.
// The "your view" cells are what actually create curiosity, since curiosity is the
// gap between what the market already believes and what you see instead.
const CURIOSITY_QUADRANTS = [
  { id: "market_problem", label: "What people already believe, about the problem" },
  { id: "market_solution", label: "What people already believe, about the solution" },
  { id: "your_problem", label: "What you see differently, about the problem" },
  { id: "your_solution", label: "What you see differently, about the solution" },
];
// Angle multiplication, Part 2 of Anvil_Segments_and_Angles_Spec.md. One fact
// from a segment or persona becomes several different psychological entry
// points, nine fixed families, each with its own named subtypes. riskySubtypes
// are excluded outright for the heaviest compliance tier (intake.regulated),
// per the spec's own cap: "capped for trust voices, off for the heaviest tier."
// safeForTrust marks the families the spec calls out as the safe, strong ones
// to prefer for a regulated or local trust-market client. Both flags are read
// in code, never asked of the model, so which angles count as safe is a known
// fact about the family, not a judgment call left to the generation itself.
const ANGLE_FAMILIES = [
  { id: "discovery", label: "Discovery and revelation", subtypes: ["New discovery", "Lost wisdom", "Missing piece", "Root cause", "Paradox"] },
  { id: "temporal", label: "Temporal and urgency", subtypes: ["Breaking news", "Trend", "Future warning", "Countdown", "Before and after"], riskySubtypes: ["Breaking news", "Countdown"] },
  { id: "authority", label: "Authority and credibility", subtypes: ["Expert", "Insider", "Crossover expert", "Unlikely teacher", "Regional"] },
  { id: "conflict", label: "Conflict and controversy", subtypes: ["Contrarian", "Myth-busting", "David versus Goliath", "Vindication"] },
  { id: "narrative", label: "Narrative and story", subtypes: ["Case study", "Journey", "Cautionary tale", "Redemption arc", "Documentary"], safeForTrust: true },
  { id: "analytical", label: "Analytical and logic", subtypes: ["Comparison", "Test", "Reverse engineering", "Elimination", "Diagnostic"], safeForTrust: true },
  { id: "social", label: "Social and identity", subtypes: ["Tribal", "Class secret", "Generational", "Movement"] },
  { id: "emotional", label: "Emotional and psychological", subtypes: ["Confession", "Permission", "Protective", "Pattern interrupt"] },
  { id: "reframe", label: "Problem reframe", subtypes: ["Wrong question", "Almost worked", "What went wrong", "Which type are you"], safeForTrust: true },
];
function angleFamiliesForIntake(regulated) {
  return ANGLE_FAMILIES.map((f) => ({
    ...f,
    subtypes: regulated && f.riskySubtypes ? f.subtypes.filter((s) => !f.riskySubtypes.includes(s)) : f.subtypes,
  }));
}
// Pain Chain and Promise Ladder share the same 4-rung shape: general, specific,
// how it shows up in life, and the deep emotion underneath. Pain and Promise are
// meant to mirror each other rung for rung.
const LADDER_RUNGS = [
  { id: "general", label: "How people describe it in general" },
  { id: "specific", label: "The specific way it actually shows up" },
  { id: "life", label: "How it plays out in day-to-day life" },
  { id: "emotion", label: "The deep emotion underneath it" },
];
// Conditions, the 5 named types. Two of these, triggers and riskReversal, are the
// highest fabrication risk in the app: an invented deadline is fake scarcity, an
// invented guarantee is a false claim. Each type must be grounded in a real fact
// already on hand or explicitly flagged as a gap, never filled in with something
// that sounds plausible.
const CONDITIONS_TYPES = [
  { id: "qualifications", name: "Qualifications", desc: "Who this is for, or who it is not for. Filters the lead before they book." },
  { id: "triggers", name: "Conversion triggers", desc: "A real reason to act now: an actual deadline, seasonal window, or limited capacity. Never fake urgency or invented scarcity." },
  { id: "riskReversal", name: "Risk reversal", desc: "Removes the downside of saying yes: a real guarantee, trial period, or reversible commitment." },
  { id: "valueAdds", name: "Value adds", desc: "A real bonus or extra that is actually included with the offer." },
  { id: "terms", name: "Terms and structures", desc: "The practical mechanics: cost structure, length of commitment, delivery timeline, cancellation." },
];
// Offer strength check, the coverage doc's reframed value equation: Promise x (Proof x
// Curiosity) / (Constraints x Conditions). This is a diagnostic lens applied to the
// offer itself, before any copy is written, not a score. Reuses the six-block names
// and colors so it reads as the same framework, not a new one.
const OFFER_STRENGTH_FACTORS = [
  { id: "Promise", label: "The promise", desc: "How big and how clear the dream outcome is." },
  { id: "Proof", label: "Proof", desc: "How believable it is that this will actually work for them." },
  { id: "Curiosity", label: "Curiosity", desc: "How much pull or interest the offer creates on its own." },
  { id: "Constraints", label: "Constraints", desc: "The friction: real objections, money, time, effort." },
  { id: "Conditions", label: "Conditions", desc: "The terms and mechanics: cost, commitment, qualifications." },
];
// Lever checklist: no model call, no fabrication risk, just a fixed reference list.
// Words are the fast, cheap first part of the job. Offer, creative, audience, the
// landing page, and speed-to-lead all sit above copy as levers, and this is the
// reminder that copy alone will not save a broken version of any of the other four.
const LEVER_CHECKLIST = {
  landingPage: [
    { id: "lp1", text: "The landing page headline says the same promise as the ad, close to word for word." },
    { id: "lp2", text: "The button on the page takes the same next step the ad's CTA promised." },
    { id: "lp3", text: "Real proof, a testimonial, a number, or a credential, is visible without scrolling." },
    { id: "lp4", text: "The page loads fast on a phone. Most clicks will be mobile." },
    { id: "lp5", text: "The form only asks for what is actually needed to take this first step, nothing more." },
    { id: "lp6", text: "There is one clear next step on the page, not three competing links." },
  ],
  speedToLead: [
    { id: "st1", text: "Someone or something is notified the moment a lead comes in." },
    { id: "st2", text: "This business can call back within 5 minutes. Response speed is one of the biggest levers on lead conversion." },
    { id: "st3", text: "There is a text or email follow-up for anyone who does not pick up the phone." },
    { id: "st4", text: "A lead that goes quiet gets at least one more touch the same day." },
  ],
};
const LEVER_CHECKLIST_STORAGE_KEY = "anvil_lever_checklist_checked";

// Segment builder (WHAT, WHO, WHY). Milestone 1 only: capture the three input
// layers and hold them in memory, shaped to match the segment entity in the
// Forge Market data-intent map, so swapping to real storage later is a small
// change, not a rewrite. No database here. That is Breyden's lane.
// Fixed lens options for an outcome, from the segments spec.
const SEGMENT_OUTCOME_LENSES = [
  { id: "type", label: "Type" },
  { id: "location", label: "Location" },
  { id: "function", label: "Function" },
  { id: "moment", label: "Moment" },
  { id: "severity", label: "Severity" },
];
// Fixed demographic groups, in the order the spec asks for: buyer first, since
// the payer may not be the user, then gender, age, race/ethnicity, identity.
const DEMOGRAPHIC_GROUPS = [
  { id: "buyer", label: "Buyer", desc: "Who actually pays or decides. May not be the user, a spouse booking for a partner, an owner buying for the practice." },
  { id: "gender", label: "Gender", desc: "" },
  { id: "age", label: "Age", desc: "As a life stage, not a number. New parent, empty nester, not \"35 to 44.\"" },
  { id: "raceEthnicity", label: "Race or ethnicity", desc: "Only where it changes the product's job." },
  { id: "identity", label: "Visible identity", desc: "Visible identity facts a stranger could tick from across the room." },
];
// Fixed facet families, from the segments spec. Belief is the biggest trap:
// find a belief the customer already holds, never install one they do not.
const FACET_FAMILIES = [
  { id: "belief", label: "Belief", desc: "A theory they already hold. Find it, do not install it." },
  { id: "identity", label: "Identity", desc: "A chosen self-label. Controls vocabulary and hard-nos." },
  { id: "state", label: "State", desc: "What is true for them right now. Controls the problem you lead with." },
  { id: "value", label: "Value", desc: "What matters in the buy. Controls the promise." },
  { id: "occasion", label: "Occasion", desc: "The event that put them in-market. Controls the why-now." },
];
const SEGMENT_STORAGE_KEY = "anvil_segment_map_scaffold"; // temporary scaffold, not the real storage. Breyden's tables replace this.
const emptySegmentMap = () => ({
  scope: "",
  outcomes: [],
  demographics: { buyer: [], gender: [], age: [], raceEthnicity: [], identity: [] },
  facets: { belief: [], identity: [], state: [], value: [], occasion: [] },
  personas: [], // composed by composePersonas(), Milestone 2
});

const CORPUS_CAP = 6000;
const HL_MAX = 30, DESC_MAX = 90, PATH_MAX = 15;

const SAMPLE = {
  offer: "The 3-Day AI Agency: a book and system that gets a complete beginner to a working, sellable AI service agency in three days, without coding or hiring.",
  audience: "Aspiring agency owners and side-hustlers, overwhelmed by AI, burned by courses that never ship.",
  struggle: "They have bought courses and watched endless tutorials but still have no working business.",
  dream: "A real, running agency they can sell to local businesses, up in days, not someday.",
  hesitation: "They think they are not technical enough, that it is too late, and that they have failed before.",
  proof: "A repeatable 3-day system, a published book, and a platform that runs the back end.",
  brandName: "Prompted Forge",
  domain: "promptedforge.ai",
  objective: "Lead generation",
  leadOffer: "Free 3-day quickstart guide",
  corpus:
`"I've spent like $4k on courses and I still don't have a single client. I just have folders of PDFs."
"Every guru says it's easy but nobody shows the boring middle part where you actually get a customer."
"I'm not a coder. The second they open a terminal I'm out."
"Honestly I'm 41 and I feel like I already missed the AI wave."
"I don't need more theory. I need someone to just tell me what to do in order."
"Refund. Another 'system' that was really just a Discord and some prompts."
"The only thing I want is one paying client so I can prove to my wife this isn't a scam."
"I get analysis paralysis. Too many tools, too many options, I freeze."
"3 day promise sounds like hype but if it's real that's exactly what I need."`,
};

const PRESETS = {
  "3-Day AI Agency (recruit operators)": { ...SAMPLE, voice: "Ambitious & direct" },
  "AI receptionist (local business)": {
    offer: "A 24/7 AI receptionist for local service businesses. It answers every call, texts back missed calls in seconds, and books appointments, so no lead slips away.",
    audience: "Local service business owners: dentists, contractors, salons, clinics, law offices. Busy, skeptical of tech, focused on revenue.",
    struggle: "The phone rings while they are with a customer. After-hours calls go to voicemail. The caller just dials the next business on the list.",
    dream: "Every call answered and every lead captured, even when they are busy, closed, or on a job.",
    hesitation: "They worry it will sound robotic and annoy their customers, that it is complicated to set up, and that it costs too much for a small shop.",
    proof: "A live demo on the owner's own number, response-time numbers, and local businesses already using it.",
    brandName: "Skyward Blue", domain: "skywardblue.com",
    objective: "Lead generation", leadOffer: "Free demo: hear it answer your own phone", voice: "Plain & credible", corpus: "",
  },
  "AI content (local business)": {
    offer: "Done-for-you AI content and follow-up for local businesses. Posts, review requests, and customer follow-ups handled every week, in the owner's own voice.",
    audience: "Local owners with no time or skill to market online, watching more visible competitors win.",
    struggle: "No time to post. Show up online once a month, then go quiet. Competitors look bigger and busier.",
    dream: "Show up everywhere, consistently, without doing the work or learning the tools.",
    hesitation: "They fear generic AI slop that does not sound like them, and another monthly bill with no clear return.",
    proof: "Sample content written in the owner's voice, and before-and-after of their online presence.",
    brandName: "Skyward Blue", domain: "skywardblue.com",
    objective: "Lead generation", leadOffer: "Free sample pack in your own voice", voice: "Plain & credible", corpus: "",
  },
  "Add AI to your business (general)": {
    offer: "Done-for-you AI setup for local businesses that know they need AI but have no idea where to start. We find the one or two highest-value uses and run them for you.",
    audience: "Overwhelmed local owners who hear about AI everywhere and do not know what is real or where to begin.",
    struggle: "AI is everywhere and none of it is clear. They are afraid of wasting money on the wrong tool and looking behind.",
    dream: "Practical AI working quietly in the business, saving time and money, without becoming a tech person.",
    hesitation: "Complexity, cost, and the fear that it is all hype.",
    proof: "A start-small pilot with one clear result, and local businesses they recognize.",
    brandName: "Skyward Blue", domain: "skywardblue.com",
    objective: "Lead generation", leadOffer: "Free AI opportunity audit for your business", voice: "Plain & credible", corpus: "",
  },
};

function repairJSON(t) {
  let inStr = false, esc = false;
  const stack = [];
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === "\"") inStr = false;
      continue;
    }
    if (c === "\"") inStr = true;
    else if (c === "{" || c === "[") stack.push(c === "{" ? "}" : "]");
    else if (c === "}" || c === "]") { if (stack.length) stack.pop(); }
  }
  let out = t;
  if (inStr) out += "\"";
  out = out.replace(/,\s*$/, "");
  out = out.replace(/,?\s*"[^"]*"\s*:\s*$/, "");
  out = out.replace(/,\s*$/, "");
  for (let i = stack.length - 1; i >= 0; i--) out += stack[i];
  return out;
}
// Fixes mid-document JSON slips that repairJSON does not target (that one only
// closes off a truncated tail). The two common LLM failure modes here are a
// literal newline inside a string, and an unescaped quote inside a quoted
// phrase (easy to hit with verbatim customer quotes). This walks the text
// tracking whether we are inside a string, escapes stray control characters,
// and for a bare quote, looks ahead past whitespace: if the next real
// character is a valid JSON continuation (, } ] or :), it really ends the
// string; otherwise it is content and gets escaped instead.
function sanitizeJSONText(t) {
  let out = "";
  let inStr = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (!inStr) {
      out += c;
      if (c === "\"") inStr = true;
      continue;
    }
    if (c === "\\") {
      out += c;
      if (i + 1 < t.length) { out += t[i + 1]; i++; }
      continue;
    }
    if (c === "\n") { out += "\\n"; continue; }
    if (c === "\r") { continue; }
    if (c === "\t") { out += "\\t"; continue; }
    if (c === "\"") {
      let j = i + 1;
      while (j < t.length && /\s/.test(t[j])) j++;
      const next = t[j];
      const endsHere = next === undefined || next === "," || next === "}" || next === "]" || next === ":";
      if (endsHere) { out += c; inStr = false; }
      else { out += "\\\""; }
      continue;
    }
    out += c;
  }
  return out;
}
// The model still slips em-dashes into generated copy sometimes even though
// the voice rule tells it not to, a well-known model tic that one prompt
// instruction does not reliably stop (the same class of problem the banned
// contrastive-negation construction was earlier this session). Rather than
// re-wording the prompt again, scrub any that get through here, recursively,
// wherever they land in the parsed result. Per CLAUDE.md's own house style,
// a comma stands in for the em-dash.
function stripEmDashes(value) {
  if (typeof value === "string") return value.replace(/\s*\u2014\s*/g, ", ").replace(/,\s*,/g, ",");
  if (Array.isArray(value)) return value.map(stripEmDashes);
  if (value && typeof value === "object") {
    const out = {};
    for (const k in value) out[k] = stripEmDashes(value[k]);
    return out;
  }
  return value;
}
function parseJSON(text) {
  let t = (text || "").trim().replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();
  const s = t.indexOf("{");
  if (s !== -1) {
    const e = t.lastIndexOf("}");
    t = e > s ? t.slice(s, e + 1) : t.slice(s);
  }
  t = sanitizeJSONText(t);
  try { return stripEmDashes(JSON.parse(t)); }
  catch (_) { return stripEmDashes(JSON.parse(repairJSON(t))); }
}
const stripQuoteMarks = (s) => String(s || "").replace(/^[\s"'“”‘’]+/, "").replace(/[\s"'“”‘’]+$/, "");
const wordCount = (s) => (s || "").trim().split(/\s+/).filter(Boolean).length;
const initials = (s) => (s || "AD").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "AD";
const cv = (segs) => Math.round((segs.length / (segs.reduce((a, s) => a + wordCount(s.text), 0) || 1)) * 100);

const Dot = ({ name }) => <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: BLOCKS[name].color, marginRight: 6, verticalAlign: "middle" }} />;
const Spinner = () => <span className="cbae-spin" style={{ display: "inline-block", width: 14, height: 14, border: "2px solid rgba(0,0,0,.18)", borderTopColor: "#141414", borderRadius: "50%" }} />;
const CONF = { high: { t: "High confidence", c: "#1B7A43", bg: "#E1F1E7" }, medium: { t: "Medium confidence", c: "#9a7a0c", bg: "#F6F7DA" }, low: { t: "Inferred, low confidence", c: "#7A0E12", bg: "#FBE4E5" } };
const FREQ = { high: "#E8242B", medium: "#9a7a0c", low: "#9a9aa0" };
const Chip = ({ text, color }) => <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".03em", textTransform: "uppercase", color, border: `1px solid ${color}`, borderRadius: 8, padding: "1px 7px", whiteSpace: "normal", wordBreak: "break-word", display: "inline-block", maxWidth: "100%" }}>{text}</span>;

// Small reusable add-a-value input, used across the segment builder's WHAT/WHO/WHY
// lists so each one does not need its own local state wired by hand.
const TagAdder = ({ onAdd, placeholder }) => {
  const [val, setVal] = useState("");
  const submit = () => { if (val.trim()) { onAdd(val); setVal(""); } };
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
      <input
        style={{ flex: 1, boxSizing: "border-box", border: "1px solid #e2e2e6", borderRadius: 8, padding: "7px 10px", fontSize: 13, fontFamily: "inherit", color: "#141414", outline: "none", background: "#fff" }}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder={placeholder}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
      />
      <button type="button" style={{ fontFamily: "inherit", fontWeight: 700, fontSize: 12, padding: "7px 12px", borderRadius: 7, border: "1px solid #d4d4d8", background: "#fff", color: "#141414", cursor: "pointer" }} onClick={submit}>Add</button>
    </div>
  );
};
const TagList = ({ items, onRemove, color }) => items.length > 0 ? (
  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
    {items.map((t, i) => (
      <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, padding: "3px 8px 3px 10px", borderRadius: 999, border: `1px solid ${color || "#d4d4d8"}`, color: "#1f1f22" }}>
        {t}
        <span onClick={() => onRemove(i)} style={{ cursor: "pointer", color: "#9a9aa0", fontWeight: 700 }}>×</span>
      </span>
    ))}
  </div>
) : null;
// A new outcome needs a name plus a fixed lens, so it gets its own small adder
// rather than reusing the plain TagAdder.
const OutcomeAdder = ({ onAdd }) => {
  const [name, setName] = useState("");
  const [lens, setLens] = useState(SEGMENT_OUTCOME_LENSES[0].id);
  const submit = () => { if (name.trim()) { onAdd(name, lens); setName(""); } };
  return (
    <div style={{ display: "flex", gap: 6 }}>
      <input
        style={{ flex: 1, boxSizing: "border-box", border: "1px solid #e2e2e6", borderRadius: 8, padding: "7px 10px", fontSize: 13, fontFamily: "inherit", color: "#141414", outline: "none", background: "#fff" }}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Add an outcome, e.g. eat normally again"
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
      />
      <select value={lens} onChange={(e) => setLens(e.target.value)} style={{ border: "1px solid #e2e2e6", borderRadius: 8, padding: "7px 8px", fontSize: 12.5, fontFamily: "inherit", background: "#fff" }}>
        {SEGMENT_OUTCOME_LENSES.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
      </select>
      <button type="button" style={{ fontFamily: "inherit", fontWeight: 700, fontSize: 12, padding: "7px 12px", borderRadius: 7, border: "1px solid #d4d4d8", background: "#fff", color: "#141414", cursor: "pointer" }} onClick={submit}>Add</button>
    </div>
  );
};


export default function App() {
  const [forgeSession, setForgeSession] = useState(null);
  const [forgeAuthLoading, setForgeAuthLoading] = useState(true);
  const [forgeAuthEmail, setForgeAuthEmail] = useState("");
  const [forgeAuthPassword, setForgeAuthPassword] = useState("");
  const [forgeAuthError, setForgeAuthError] = useState("");
  useEffect(() => {
    let mounted = true;
    getForgeSession()
      .then((session) => {
        if (mounted) setForgeSession(session);
      })
      .finally(() => {
        if (mounted) setForgeAuthLoading(false);
      });
    const unsubscribe = onForgeAuthStateChange((session) => {
      if (!mounted) return;
      setForgeSession(session);
      setForgeAuthLoading(false);
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);
  const [mode, setMode] = useState("guided");
  const [intake, setIntake] = useState({ core: "", niche: "", offer: "", audience: "", struggle: "", dream: "", hesitation: "", proof: "", corpus: "", brandName: "", domain: "", objective: "Lead generation", leadOffer: "", voice: "Plain & credible", regulated: false, awareness: "" });
  const [platform, setPlatform] = useState("Facebook");
  const [complianceAck, setComplianceAck] = useState(false);
  const [avatar, setAvatar] = useState(null);
  const [avatarStage, setAvatarStage] = useState("");
  const [blocks, setBlocks] = useState({ Pain: "", Promise: "", Proof: "", Constraints: "", Curiosity: "", Conditions: "" });
  const [selectedAngle, setSelectedAngle] = useState({ family: "", subtype: "" });
  const [notes, setNotes] = useState({});
  const [proofPairing, setProofPairing] = useState([]);
  const [constraintDissolve, setConstraintDissolve] = useState([]);
  const [curiosityAngles, setCuriosityAngles] = useState([]);
  const [characterizations, setCharacterizations] = useState([]);
  const [angleMultiplication, setAngleMultiplication] = useState([]);
  const [intuitionPumps, setIntuitionPumps] = useState([]);
  const [evocativeNames, setEvocativeNames] = useState([]);
  const [antiConstraintNames, setAntiConstraintNames] = useState([]);
  const [painChain, setPainChain] = useState([]);
  const [promiseLadder, setPromiseLadder] = useState([]);
  const [conditionsResult, setConditionsResult] = useState([]);
  const [offerStrength, setOfferStrength] = useState([]);
  const [offerStrengthLever, setOfferStrengthLever] = useState("");
  const [checkedLevers, setCheckedLevers] = useState(() => {
    try {
      const raw = window.localStorage.getItem(LEVER_CHECKLIST_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) { return []; }
  });
  useEffect(() => {
    try { window.localStorage.setItem(LEVER_CHECKLIST_STORAGE_KEY, JSON.stringify(checkedLevers)); } catch (e) {}
  }, [checkedLevers]);
  const toggleLever = (id) => setCheckedLevers((c) => c.includes(id) ? c.filter((x) => x !== id) : [...c, id]);

  // Segment builder state, Milestone 1. Temporary localStorage scaffold only,
  // so work survives a refresh while testing, per the START_HERE boundary.
  // This is not the real storage. Breyden's tables replace this at merge.
  const [segmentMap, setSegmentMap] = useState(() => {
    try {
      const raw = window.localStorage.getItem(SEGMENT_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed === "object" ? { ...emptySegmentMap(), ...parsed } : emptySegmentMap();
    } catch (e) { return emptySegmentMap(); }
  });
  useEffect(() => {
    try { window.localStorage.setItem(SEGMENT_STORAGE_KEY, JSON.stringify(segmentMap)); } catch (e) {}
  }, [segmentMap]);

  // Milestone 3: which composed persona, if any, the generation flow is currently
  // targeting. Null means generate the old way, from the single avatar.
  const [activePersonaId, setActivePersonaId] = useState(null);

  const addOutcome = (name, lens) => {
    if (!name.trim()) return;
    setSegmentMap((s) => ({ ...s, outcomes: [...s.outcomes, { id: Date.now() + Math.random(), name: name.trim(), lens, subOutcomes: [] }] }));
  };
  const removeOutcome = (id) => setSegmentMap((s) => ({ ...s, outcomes: s.outcomes.filter((o) => o.id !== id) }));
  const addSubOutcome = (outcomeId, text) => {
    if (!text.trim()) return;
    setSegmentMap((s) => ({ ...s, outcomes: s.outcomes.map((o) => o.id === outcomeId ? { ...o, subOutcomes: [...o.subOutcomes, text.trim()] } : o) }));
  };
  const removeSubOutcome = (outcomeId, i) => setSegmentMap((s) => ({ ...s, outcomes: s.outcomes.map((o) => o.id === outcomeId ? { ...o, subOutcomes: o.subOutcomes.filter((_, idx) => idx !== i) } : o) }));

  const addDemographic = (groupId, text) => {
    if (!text.trim()) return;
    setSegmentMap((s) => ({ ...s, demographics: { ...s.demographics, [groupId]: [...s.demographics[groupId], text.trim()] } }));
  };
  const removeDemographic = (groupId, i) => setSegmentMap((s) => ({ ...s, demographics: { ...s.demographics, [groupId]: s.demographics[groupId].filter((_, idx) => idx !== i) } }));

  const addFacet = (familyId, text) => {
    if (!text.trim()) return;
    setSegmentMap((s) => ({ ...s, facets: { ...s.facets, [familyId]: [...s.facets[familyId], text.trim()] } }));
  };
  const removeFacet = (familyId, i) => setSegmentMap((s) => ({ ...s, facets: { ...s.facets, [familyId]: s.facets[familyId].filter((_, idx) => idx !== i) } }));
  const [templateId, setTemplateId] = useState("auto");
  const [recommended, setRecommended] = useState(null);
  const [testAxis, setTestAxis] = useState("Hook");
  const [testCount, setTestCount] = useState(3);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [results, setResults] = useState([]);
  const [offers, setOffers] = useState([]);
  const [chosenOffer, setChosenOffer] = useState("");
  const [frontMode, setFrontMode] = useState("brainstorm");
  const [manualOffer, setManualOffer] = useState("");
  const [offerSteer, setOfferSteer] = useState("");
  const [showRef, setShowRef] = useState(false);
  const resultsRef = useRef(null);
  const avatarRef = useRef(null);
  const [done, setDone] = useState("");

  const setIn = (k, v) => setIntake((s) => ({ ...s, [k]: v }));
  const markDone = (k) => { setDone(k); setTimeout(() => setDone((d) => (d === k ? "" : d)), 1800); };
  const setBlock = (k, v) => {
    setBlocks((b) => ({ ...b, [k]: v }));
    if (k === "Curiosity") setSelectedAngle({ family: "", subtype: "" });
  };
  const applyCuriosityAngle = (text, family, subtype) => {
    setBlocks((b) => ({ ...b, Curiosity: text }));
    setSelectedAngle({ family, subtype });
  };
  const loadPreset = (k) => PRESETS[k] && setIntake((s) => ({ ...s, ...PRESETS[k] }));
  const hasCorpus = intake.corpus.trim().length > 0;
  const corpusTrimmed = intake.corpus.length > CORPUS_CAP;
  const isLeadGen = intake.objective === "Lead generation";
  const isSearch = isSearchPlatform(platform);
  const brand = intake.brandName || "Your Brand";
  const domain = (intake.domain || "yourbrand.com").replace(/^https?:\/\//, "").replace(/\/$/, "");
  const ctaList = isLeadGen ? LEADGEN_CTAS : SALES_CTAS;
  const hasGroundedConditions = Boolean(blocks.Conditions.trim() || intake.leadOffer.trim());
  const hasGroundedProof = Boolean(blocks.Proof.trim() || intake.proof.trim());

  const activeTemplate = useMemo(() => {
    if (templateId === "auto") return recommended ? TEMPLATES.find((t) => t.id === recommended.id) : null;
    return TEMPLATES.find((t) => t.id === Number(templateId));
  }, [templateId, recommended]);

  const blockText = () => formatCopyBlocks(blocks, BLOCK_NAMES);
  const voiceLine = () => composeVoiceRule(VERTICAL_LANGUAGE_PROFILES[intake.voice] || VERTICAL_LANGUAGE_PROFILES["Plain & credible"]);
  const complianceLine = () => intake.regulated ? composeComplianceLine(COMPLIANCE_PROFILE) : "";
  const objectiveLine = () => (isLeadGen
    ? intake.leadOffer.trim()
      ? `OBJECTIVE: lead generation. The ad sells the supplied next step: ${intake.leadOffer.trim()}. Use that exact next step in the CTA and Conditions block. Do not add price, availability, deadline, guarantee, or other terms that were not supplied.`
      : "OBJECTIVE: lead generation. No lead magnet or next-step offer was supplied. Use a neutral Learn More or Contact Us CTA. Leave Conditions absent and do not invent a free consultation, inspection, quote, discount, deadline, guarantee, or other offer term."
    : `OBJECTIVE: direct sale. Drive the purchase with the CTA.`) + "\n" + voiceLine() + complianceLine();

  // Milestone 3: awareness stage as a first-class input, alongside objective and
  // voice. Empty means not set, in which case generation behaves exactly as
  // before with no awareness-specific guidance.
  const awarenessLine = () => {
    const stage = AWARENESS_STAGES.find((s) => s.id === intake.awareness);
    return stage ? `\nAWARENESS STAGE: ${stage.label}, ${stage.desc} ${stage.guidance}` : "";
  };

  // Milestone 3: which composed persona, if any, is targeted for this generation.
  const activePersona = segmentMap.personas.find((p) => p.id === activePersonaId) || null;
  const personaLine = () => {
    if (!activePersona) return "";
    const demoText = Object.values(activePersona.demographics || {}).filter(Boolean).join(", ");
    const facetText = (activePersona.facets || []).map((f) => f.value).join(", ");
    return `\nTARGET PERSONA: ${activePersona.name}. ${activePersona.description} Wants: ${activePersona.outcomeName}.${demoText ? " Who they are: " + demoText + "." : ""}${facetText ? " Why they are here: " + facetText + "." : ""} Shape the pain, the promise, and the hook to this specific person, not a generic version of the buyer. If an avatar is also present below, use it only for supporting proof and objections, this persona decides the angle.`;
  };

  async function buildAvatar() {
    setError("");
    if (!intake.offer.trim()) { setError("Add what you sell first. The rest is optional."); return; }
    setBusy("avatar");
    try {
      const corpus = intake.corpus.slice(0, CORPUS_CAP);
      const context = `WHAT THEY SELL: ${intake.offer}
WHO IT IS FOR: ${intake.audience || "(infer)"}
STRUGGLE: ${intake.struggle || "(infer)"}
DREAM: ${intake.dream || "(infer)"}
HESITATION: ${intake.hesitation || "(infer)"}
PROOF SUPPLIED BY THE SELLER: ${intake.proof || "(none supplied; do not infer proof)"}`;

      // Call 1: research pass. Its only job is to extract and structure raw findings,
      // so it gets its own token budget instead of sharing one call with the synthesis below.
      const researchTask = hasCorpus
        ? `RAW MARKET LANGUAGE the seller pasted:
"""
${corpus}
"""
RUN A RESEARCH PASS: extract statements and tag them (pain, desire, belief, objection, demanded-proof, existing-angle, quote); cluster and rank by frequency and emotional charge; classify pains (physiological, psychological, social stigma, measurable); flag angles already present and their saturation; attach a short verbatim quote (20 words max) to each pain when one exists, never invent quotes. Ground every field in the corpus. Confidence high if strongly supported, medium if partial, low if mostly inferred.`
        : `No market language was pasted. Build this research from general knowledge of this exact market and from the answers given. Ground every field in what is common and widely shared among this audience, the pains, desires, and prior solutions that most members of this market actually have. Be specific to this vertical, not generic. Use "" for quotes since none were provided, and never invent quotes. Set confidence by how well understood this market is: use "medium" for a common, well documented vertical, "low" only when it is narrow, niche, or mostly a guess. Never use "high" without pasted market language. In coverageNote, say this is built from general market knowledge and name the basis for the confidence level.`;
      const researchPrompt =
`You are a market research analyst doing an extraction pass, not writing the final avatar yet.
${context}
${voiceLine()}${complianceLine()}

${researchTask}

Be thorough, you have room here. Use up to 5 items per array where you have real, specific material, fewer if you would be padding. Return ONLY valid JSON, no fences: escape any quote marks inside a string as \", and never put a literal line break inside a string value.
{"confidence":"high|medium|low","coverageNote":"","painPoints":[{"text":"","type":"psychological|physiological|social|measurable","frequency":"high|medium|low","quote":"<=20 words or empty, the words only, no surrounding quote marks"}],"relationalImpact":[""],"desiredOutcomes":[""],"coreWound":"","fears":[""],"beliefs":[""],"constraints":{"Money":"","Time":"","Effort":""},"objections":[""],"priorSolutions":[{"tried":"","whyFailed":""}],"wontDo":[""],"villain":"","secondaryGain":"","proofTrusted":[""],"proofGaps":[""],"marketAngles":[{"angle":"","saturation":"high|medium|low"}],"voiceSamples":[""]}`;
      setAvatarStage("research");
      const researchOut = await requestForgeGeneration(researchPrompt);
      const research = parseJSON(researchOut);

      // Call 2: synthesis. Takes the structured research as input and writes the final
      // avatar in the schema the rest of the app reads, with real room to go deeper
      // than the old single-call version could afford.
      const synthesisPrompt =
`You are a market research strategist building a buyer avatar in the Anvil tradition, from this structured research pass:
RESEARCH: ${JSON.stringify(research)}

${context}
${voiceLine()}${complianceLine()}

Reframe every field for THIS market, not generic infomarketing. The villain is a market force or system, never a person the reader loves. Relational impact means staff, partners, family in the business, reputation, and customers, framed plainly, not cruelly. No vanity or shock framing.

You have real room here: up to 4 items per array, and a phrase can run a full sentence when it earns its place. Do not pad or invent to fill space. Return ONLY valid JSON, no fences: escape any quote marks inside a string as \", and never put a literal line break inside a string value.
{"confidence":"high|medium|low","coverage":"one line on corpus vs inference","pains":[{"text":"","type":"psychological|physiological|social|measurable","frequency":"high|medium|low","quote":"<=20 words or empty, the words only, no surrounding quote marks"}],"relationalImpact":["how the problem shows up with staff, family, reputation, or customers"],"desire":"the promised land in one line","dreamOutcomes":["concrete, specific outcomes if it were fully solved"],"coreWound":"","fears":["deep, mostly unspoken fears"],"beliefs":[""],"constraints":{"Money":"","Time":"","Effort":""},"objections":[""],"triedBefore":[{"tried":"a prior solution they tried","whyFailed":"why it let them down"}],"wontDo":["what they refuse to do to fix it"],"villain":"the outside force they blame, a market force or system, not a person","secondaryGain":"what they quietly lose or give up by solving it","proofTrusted":[""],"proofGaps":[""],"marketAngles":[{"angle":"","saturation":"high|medium|low"}],"voice":[""]}`;
      setAvatarStage("build");
      const out = await requestForgeGeneration(synthesisPrompt, 2400);
      setAvatar(parseJSON(out)); markDone("avatar"); scrollAvatar();
    } catch (e) { setError("Could not build the avatar. " + ((e && e.message) || "Unknown error") + ". Try again, or switch to Expert mode to skip the avatar."); }
    finally { setBusy(""); setAvatarStage(""); }
  }

  async function buildBlocks() {
    setError("");
    if (!avatar && !activePersona) { setError("Build the avatar first, or select a persona from the segment builder."); return; }
    setBusy("blocks");
    try {
      const prompt =
`Turn this researched avatar into the six blocks for the offer.
OFFER: ${intake.offer}
${objectiveLine()}${awarenessLine()}${personaLine()}
${avatar ? "AVATAR: " + JSON.stringify(avatar) : "No full avatar on hand, work from the target persona above and the offer."}
Per block, 1 to 3 sentences in the market's own language:
- Pain: a layered pain (general -> specific -> in their life -> deep emotion)${avatar ? "; lean on high-frequency pains, the relationalImpact, and real quotes" : ", lean on the persona's facets for what is actually going on for them"}. Where it fits, name the villain so the pain is not the reader's fault.
- Promise: a promise ladder toward the desire${avatar ? " and the dreamOutcomes" : ""}, framed as the result${avatar ? " WITHOUT the things in wontDo" : ""}${activePersona ? ", aimed at this persona's outcome specifically" : ""}.
- Proof: use ONLY this seller-supplied proof: ${intake.proof || "(none supplied; return an empty Proof string and explain the gap in notes)"}. Audience proof preferences in the avatar describe what would be persuasive; they are not evidence the seller has.
- Constraints: name the biggest blocking belief/objection${activePersona ? " for this persona" : ""}, then dissolve or sidestep it by acknowledging it, wedging in a counterexample, then reframing.
- Curiosity: a fresh insight near the insight level; AVOID high-saturation angles; name a mechanism if you can.
- Conditions: one CTA wrapper that matches the objective.
Return ONLY JSON, no fences:
{"Pain":"","Promise":"","Proof":"","Constraints":"","Curiosity":"","Conditions":"","notes":{"Pain":"","Promise":"","Proof":"","Constraints":"","Curiosity":"","Conditions":""}}`;
      const out = await requestForgeGeneration(prompt);
      const j = parseJSON(out);
      setBlocks({ Pain: j.Pain || "", Promise: j.Promise || "", Proof: j.Proof || "", Constraints: j.Constraints || "", Curiosity: j.Curiosity || "", Conditions: j.Conditions || "" });
      setSelectedAngle({ family: "", subtype: "" });
      setNotes(j.notes || {});
      markDone("blocks");
    } catch (e) { setError("Could not build the blocks. " + ((e && e.message) || "Unknown error") + ". Try again."); }
    finally { setBusy(""); }
  }

  async function draftBlocksExpert() {
    setError("");
    if (!intake.offer.trim()) { setError("Add what you sell first."); return; }
    setBusy("blocks");
    try {
      const prompt =
`Write the six blocks for this offer in the market's language, each 1 to 3 sentences.
OFFER: ${intake.offer}
MARKET: ${intake.audience || "infer"}
PROOF SUPPLIED BY THE SELLER: ${intake.proof || "(none supplied; return an empty Proof string)"}
NEXT STEP OR OFFER TERMS: ${intake.leadOffer || "(none supplied; do not invent terms)"}
${objectiveLine()}
Blocks: Pain, Promise, Proof, Constraints, Curiosity (name a mechanism), Conditions (a CTA wrapper matching the objective). Proof must be empty when seller-supplied proof is absent. Conditions must be empty when no grounded next step or offer term exists.
Return ONLY JSON: {"Pain":"","Promise":"","Proof":"","Constraints":"","Curiosity":"","Conditions":""}`;
      const out = await requestForgeGeneration(prompt);
      const j = parseJSON(out);
      setBlocks({ Pain: j.Pain || "", Promise: j.Promise || "", Proof: j.Proof || "", Constraints: j.Constraints || "", Curiosity: j.Curiosity || "", Conditions: j.Conditions || "" });
      setSelectedAngle({ family: "", subtype: "" });
      markDone("blocks");
    } catch (e) { setError("Could not draft. " + ((e && e.message) || "Unknown error") + ". Fill the blocks by hand or try again."); }
    finally { setBusy(""); }
  }

  async function buildProofPairing() {
    setError("");
    const dreamOutcomes = avatar && Array.isArray(avatar.dreamOutcomes) ? avatar.dreamOutcomes.join(" | ") : "";
    if (!blocks.Promise.trim() && !dreamOutcomes && !intake.dream.trim()) { setError("Fill in the Promise block, or the dream field, first. Proof needs a claim to back."); return; }
    setBusy("proof");
    try {
      const claimsContext = `PROMISE BLOCK: ${blocks.Promise || "(not filled)"}
DREAM OUTCOME(S): ${dreamOutcomes || intake.dream || "(infer)"}`;
      const proofOnHand = `PROOF SUPPLIED BY THE SELLER: ${intake.proof || "(none supplied; do not recommend wording that implies proof exists)"}
${avatar ? `AUDIENCE PROOF EXPECTATIONS (research guidance only, not proof on hand): ${JSON.stringify(avatar.proofTrusted || [])}\nPROOF GAPS: ${JSON.stringify(avatar.proofGaps || [])}` : "No audience proof-preference research is available."}`;
      const typesList = PROOF_TYPES.map((p) => `${p.id}: ${p.name} [${p.category}, hard-to-fake ${p.strength}/5${p.underused ? ", underused" : ""}] - ${p.desc}`).join("\n");
      // The taxonomy, voice rule, and task instructions are identical on every call to
      // this function (they only change if the voice or the regulated toggle changes),
      // and together they are close to the 1,024-token minimum Sonnet needs to cache at
      // all, so this is the one prompt in the app where marking a cache breakpoint is
      // actually worth doing. Only the offer-specific claims and proof stay dynamic.
      const systemText =
`You are a direct-response strategist pairing proof to claims, in the Anvil framework.
${voiceLine()}${complianceLine()}

You will be given an offer, a promise or dream outcome, and the proof already on hand. Identify 2 to 4 specific claims or promises being made, pulled only from what you are given, do not invent new claims. For each claim, pick the single best-fitting proof type from this closed list, using the id exactly as written:
${typesList}

Rules: match proof strength to the size of the claim; a bold or specific promise needs a harder-to-fake proof type when one is available, a modest claim can use a lighter one. Only draft proofText from what is actually in the proof on hand, never invent a testimonial, a number, or a credential that was not given. If nothing on hand actually backs a claim, set gap to true and leave proofText thin or empty rather than making something up. Prefer psychological proof types when they fit, since this category is underused, but never force one.

Return ONLY valid JSON, no fences: escape any quote marks inside a string as \", and never put a literal line break inside a string value.
{"pairings":[{"claim":"the specific claim or promise","proofTypeId":"one of the ids above","proofText":"one sentence using only real material on hand, or empty if gap is true","gap":false}]}`;
      const prompt =
`OFFER: ${intake.offer}
${claimsContext}
${proofOnHand}`;
      const system = [{ type: "text", text: systemText, cache_control: { type: "ephemeral" } }];
      const out = await requestForgeGeneration(prompt, 1800, system);
      const j = parseJSON(out);
      setProofPairing(Array.isArray(j.pairings) ? j.pairings.slice(0, 4) : []);
      markDone("proof");
    } catch (e) { setError("Could not build proof pairing. " + ((e && e.message) || "Unknown error") + ". Try again, or fill the Proof block by hand."); }
    finally { setBusy(""); }
  }

  async function buildConstraintsDissolve() {
    setError("");
    const hasMaterial = (avatar && (avatar.objections || avatar.beliefs)) || intake.hesitation.trim();
    if (!hasMaterial) { setError("Add a hesitation or build the avatar first. Dissolving a constraint needs a real objection to work from."); return; }
    setBusy("constraints");
    try {
      const material = avatar
        ? `OBJECTIONS: ${JSON.stringify(avatar.objections || [])}
BELIEFS: ${JSON.stringify(avatar.beliefs || [])}
TRIED BEFORE (and why it failed): ${JSON.stringify(avatar.triedBefore || [])}
THE 3 CONSTRAINTS: ${JSON.stringify(avatar.constraints || {})}`
        : `HESITATION: ${intake.hesitation || "(infer)"}`;
      const prompt =
`You are a persuasion strategist dissolving objections, in the Anvil framework.
OFFER: ${intake.offer}
${material}
${voiceLine()}${complianceLine()}

For 2 to 4 real objections or beliefs above, do not invent new ones, classify each on this hierarchy:
- Experience: a specific bad experience or a missing fact. Dissolve it directly.
- Belief: a generalized rule they have concluded from experience. Dissolve it with an acknowledge, a wedge, and an elaboration.
- Value: something they hold as personally important, not just a factual belief. Never argue with it, side-step by showing the offer serves the value instead of fighting it.
- Identity: tied to who they are or how they see themselves. Never challenge it directly, side-step by framing the offer as consistent with that identity, not a threat to it.

For an Experience or Belief level objection, write a dissolve in three short parts: acknowledge the objection as reasonable, wedge in a distinction or a real counterexample showing it does not universally apply, then elaborate on why that changes things for this specific offer. For a Value or Identity level objection, write a single sidestep line that reframes the offer as compatible with what they value or who they are. It must never read as a rebuttal or as arguing with the person.

Return ONLY valid JSON, no fences: escape any quote marks inside a string as \", and never put a literal line break inside a string value.
{"constraints":[{"objection":"the real objection or belief, in their words","level":"Experience|Belief|Value|Identity","strategy":"dissolve|sidestep","acknowledge":"","wedge":"","elaborate":"","sidestep":""}]}`;
      const out = await requestForgeGeneration(prompt, 1800);
      const j = parseJSON(out);
      setConstraintDissolve(Array.isArray(j.constraints) ? j.constraints.slice(0, 4) : []);
      markDone("constraints");
    } catch (e) { setError("Could not build the dissolve. " + ((e && e.message) || "Unknown error") + ". Try again, or fill the Constraints block by hand."); }
    finally { setBusy(""); }
  }

  async function buildCuriosityAngles() {
    setError("");
    const hasMaterial = (avatar && (avatar.marketAngles || avatar.pains || avatar.dreamOutcomes)) || blocks.Pain.trim() || blocks.Promise.trim() || intake.struggle.trim() || intake.dream.trim();
    if (!hasMaterial) { setError("Fill in Pain or Promise, or the struggle and dream fields, or build the avatar first. Curiosity needs a real pain and promise to find the gap between."); return; }
    setBusy("curiosity");
    try {
      const material = avatar
        ? `MARKET ANGLES ALREADY IN USE (avoid these, they are saturated): ${JSON.stringify(avatar.marketAngles || [])}
WHAT THEY HAVE TRIED BEFORE (and why it failed): ${JSON.stringify(avatar.triedBefore || [])}
PAINS: ${JSON.stringify(avatar.pains || [])}
DREAM OUTCOMES: ${JSON.stringify(avatar.dreamOutcomes || [])}`
        : `PAIN: ${blocks.Pain || intake.struggle || "(infer)"}
PROMISE: ${blocks.Promise || intake.dream || "(infer)"}`;
      const quadrantList = CURIOSITY_QUADRANTS.map((q) => `${q.id}: ${q.label}`).join("\n");
      const prompt =
`You are a direct-response strategist finding curiosity angles, in the Anvil framework.
OFFER: ${intake.offer}
${material}
${voiceLine()}${complianceLine()}

Curiosity lives in the gap between what the market already believes and what you actually see. For each of these 4 fixed quadrants, using the id exactly as written, write one short angle:
${quadrantList}

The two "what people already believe" quadrants should sound like the common, saturated take, the thing every competitor already says. The two "what you see differently" quadrants are the actual differentiator, write a different, specific angle, not a rephrase of the common one, grounded in the pain and promise above, not invented from nothing. Never invent a statistic, a study, a cited research finding, or a named authority that is not given in the material above. State the differentiator as your own observation about the problem, not as a claimed external fact. Avoid any angle that resembles what they have tried before or what is already saturated in the market angles list. Do not use a Taboo Solution frame, a shock or taboo characterization, or an idea caricature, in any quadrant, regardless of voice. Keep every angle something you could say to this client's face without flinching.

Also name up to 2 characterizations: a plain, specific name for a mechanism or step in how the offer works, the kind of naming that makes a process feel concrete and ownable. Example of the right register: "same-day roof report," not a gimmick name and not a hype name.

Return ONLY valid JSON, no fences: escape any quote marks inside a string as \", and never put a literal line break inside a string value.
{"angles":[{"quadrantId":"one of the 4 ids above","angle":"the angle, one to two sentences"}],"characterizations":[{"name":"the short name","description":"one sentence on what it names and why it fits"}]}`;
      const out = await requestForgeGeneration(prompt, 1800);
      const j = parseJSON(out);
      setCuriosityAngles(Array.isArray(j.angles) ? j.angles.slice(0, 4) : []);
      setCharacterizations(Array.isArray(j.characterizations) ? j.characterizations.slice(0, 2) : []);
      markDone("curiosity");
    } catch (e) { setError("Could not build curiosity angles. " + ((e && e.message) || "Unknown error") + ". Try again, or fill the Curiosity block by hand."); }
    finally { setBusy(""); }
  }

  async function buildAngleMultiplication() {
    setError("");
    const hasMaterial = activePersona || (avatar && (avatar.pains || avatar.dreamOutcomes)) || blocks.Pain.trim() || blocks.Promise.trim() || intake.struggle.trim() || intake.dream.trim();
    if (!hasMaterial) { setError("Pick a persona from the segment builder, or fill in Pain or Promise, or build the avatar first. Angle multiplication needs one real fact to multiply."); return; }
    setBusy("angles");
    try {
      const fact = activePersona
        ? `THE FACT TO MULTIPLY, ONE PERSONA'S SITUATION: ${activePersona.name}. ${activePersona.description} Wants: ${activePersona.outcomeName}.`
        : avatar
          ? `PAINS: ${JSON.stringify(avatar.pains || [])}
DREAM OUTCOMES: ${JSON.stringify(avatar.dreamOutcomes || [])}`
          : `PAIN: ${blocks.Pain || intake.struggle || "(infer)"}
PROMISE: ${blocks.Promise || intake.dream || "(infer)"}`;
      const families = angleFamiliesForIntake(intake.regulated);
      const familyList = families.map((f) => `${f.id}: ${f.label}. Subtypes: ${f.subtypes.join(", ")}.`).join("\n");
      const prompt =
`You are a direct-response strategist multiplying one fact into many angles, in the Anvil framework.
OFFER: ${intake.offer}
${awarenessLine()}
${fact}
${voiceLine()}${complianceLine()}

One fact becomes many hooks. You do not change minds with new information, you change how people attend to information they already have. For each of these 9 fixed angle families, using the id exactly as written, each family exactly once, no repeats and none skipped, pick the single best-fitting subtype from that family's own list below and write one hook, one to two sentences, grounded only in the fact given above, never inventing a new fact, statistic, or persona detail to make a family fit:
${familyList}

Never invent a statistic, a study, a cited research finding, or a named authority not given in the material above. Under Authority and credibility, only claim expertise or insider standing the material actually supports, never fabricate a credential, and never phrase the angle as reporting what a real, unnamed group of professionals says, believes, or has observed, for example "dentists say" or "experts report", unless that exact claim is given in the material above, ground the angle in the offer's own real facts instead. Under Conflict and controversy, do not frame this as a hidden conspiracy or a suppressed truth, contrarian and myth-busting angles challenge a common assumption, they do not imply a cover-up. Under Narrative and story, unless an actual testimonial or case is given in the material above, a Case study, Journey, or Documentary angle must open with one of these exact phrases: "Picture someone who," "Imagine a person who," or "Think of someone who," never narrated as if it already happened to a specific real person, and never with an invented name, age, or before-and-after result. ${intake.regulated ? "This is a regulated vertical, breaking-news and countdown urgency framing are excluded from the list above entirely, do not reach for that framing under any other family either." : "Keep any breaking-news or countdown framing grounded in something actually true and current, never invented timing pressure."} Find the belief or fact already in the material, do not install one the reader does not already hold.

Return ONLY valid JSON, no fences: escape any quote marks inside a string as \", and never put a literal line break inside a string value.
{"angles":[{"familyId":"one of the 9 ids above","subtype":"the subtype chosen","angle":"the hook, one to two sentences"}]}`;
      const out = await requestForgeGeneration(prompt, 1800);
      const j = parseJSON(out);
      setAngleMultiplication(Array.isArray(j.angles) ? j.angles.slice(0, 9) : []);
      markDone("angles");
    } catch (e) { setError("Could not multiply angles. " + ((e && e.message) || "Unknown error") + ". Try again, or fill the Curiosity block by hand."); }
    finally { setBusy(""); }
  }

  async function buildNamingAndMetaphor() {
    setError("");
    const dreamOutcomes = avatar && Array.isArray(avatar.dreamOutcomes) ? avatar.dreamOutcomes.join(" | ") : "";
    const hasMaterial = blocks.Promise.trim() || dreamOutcomes || intake.dream.trim() || characterizations.length > 0;
    if (!hasMaterial) { setError("Fill in the Promise block or the dream field first, or run the curiosity angles above. Naming needs a real mechanism to name."); return; }
    setBusy("naming");
    try {
      const material = `PROMISE: ${blocks.Promise || intake.dream || "(infer)"}
DREAM OUTCOME(S): ${dreamOutcomes || "(infer)"}`;
      const existingNames = characterizations.length > 0 ? `MECHANISM NAMES ALREADY IN USE (do not repeat, build on the same real mechanism instead): ${JSON.stringify(characterizations.map((c) => c.name))}` : "";
      const objectionsSource = constraintDissolve.length > 0 ? constraintDissolve.map((c) => c.objection) : (intake.hesitation ? [intake.hesitation] : []);
      const objectionsText = objectionsSource.length > 0 ? `REAL OBJECTIONS TO ANSWER (use only these, do not invent new ones): ${JSON.stringify(objectionsSource)}` : "";
      const prompt =
`You are a direct-response strategist naming the mechanism behind this offer and finding metaphors that make it concrete, in the Anvil framework.
OFFER: ${intake.offer}
${material}
${existingNames}
${objectionsText}
${voiceLine()}${complianceLine()}

Write exactly 4 intuition pumps, one metaphor for each of these 4 fixed types, using the type id exactly as written, each type exactly once, no repeats and none skipped:
natural: draws on something from nature or the body
mechanical: draws on a machine, system, or process
force: draws on physical force, pressure, momentum, or resistance
association: draws on a familiar, unrelated everyday concept the audience already understands
Match each metaphor to how this specific audience already thinks about their own world, not generic.

Then write 3 names for the real mechanism above, at three different levels of how much each one reveals:
- descriptive: says plainly what it does, no mystery
- evocative: hints at the benefit or mechanism without spelling it out fully
- abstract: a short, memorable name that reveals little on its own and needs the ad copy around it to explain it

Then, from the objections given above, exclude any objection about price, cost, subscriptions, contracts, refunds, or guarantees, those need a real number or policy to defuse, and this is not the place to invent one. From what remains, the objections about how the product works, sounds, or feels, write up to 2 names that bake that objection's answer directly into the name itself, so the name defuses it before anyone has to argue with it. Only use a fact already stated in the OFFER or PROMISE material above, never invent a capability, a feature, or a mechanism to sound like a good answer. It is fine to return fewer than 2, or none, if nothing qualifies.

Do not use a Taboo Solution frame, a shock or taboo characterization, or an idea caricature, in any of the above, regardless of voice. Never invent a statistic, a study, a cited research finding, or a named authority not given in the material above, in any of the above. Nothing should be gimmicky, cute at the expense of clarity, or drift into a health, legal, or financial claim.

Return ONLY valid JSON, no fences: escape any quote marks inside a string as \", and never put a literal line break inside a string value.
{"intuitionPumps":[{"type":"natural|mechanical|force|association","metaphor":"one to two sentences"}],"evocativeNames":[{"level":"descriptive|evocative|abstract","name":"the name"}],"antiConstraintNames":[{"objection":"the objection answered","name":"the name"}]}`;
      const out = await requestForgeGeneration(prompt, 1800);
      const j = parseJSON(out);
      setIntuitionPumps(Array.isArray(j.intuitionPumps) ? j.intuitionPumps.slice(0, 4) : []);
      setEvocativeNames(Array.isArray(j.evocativeNames) ? j.evocativeNames.slice(0, 3) : []);
      setAntiConstraintNames(Array.isArray(j.antiConstraintNames) ? j.antiConstraintNames.slice(0, 2) : []);
      markDone("naming");
    } catch (e) { setError("Could not build naming and metaphor. " + ((e && e.message) || "Unknown error") + ". Try again, or name it by hand."); }
    finally { setBusy(""); }
  }

  async function buildPainPromiseLadder() {
    setError("");
    const pains = avatar && Array.isArray(avatar.pains) ? avatar.pains : [];
    const dreamOutcomes = avatar && Array.isArray(avatar.dreamOutcomes) ? avatar.dreamOutcomes : [];
    const hasMaterial = pains.length > 0 || dreamOutcomes.length > 0 || blocks.Pain.trim() || blocks.Promise.trim() || intake.struggle.trim() || intake.dream.trim();
    if (!hasMaterial) { setError("Fill in Pain or Promise, or the struggle and dream fields, or build the avatar first. The ladders need a real pain and desire to build from."); return; }
    setBusy("ladder");
    try {
      const material = `PAIN(S): ${JSON.stringify(pains.length > 0 ? pains : [blocks.Pain || intake.struggle || "(infer)"])}
DREAM OUTCOME(S): ${JSON.stringify(dreamOutcomes.length > 0 ? dreamOutcomes : [blocks.Promise || intake.dream || "(infer)"])}`;
      const rungList = LADDER_RUNGS.map((r) => `${r.id}: ${r.label}`).join("\n");
      const prompt =
`You are a direct-response strategist building a layered Pain Chain and a parallel Promise Ladder, in the Anvil framework.
OFFER: ${intake.offer}
${material}
${voiceLine()}${complianceLine()}

Build a Pain Chain: exactly 4 rungs, one for each of these fixed rungs, using the id exactly as written, each rung exactly once, no repeats and none skipped, moving from the broad and general down to the specific, felt reality:
${rungList}

Each rung should get sharper and more specific than the one before it, ending on the real emotional weight underneath the pain, not just a restatement of the general complaint in different words.

Then build a Promise Ladder with the same 4 rungs, mirroring the Pain Chain rung for rung, but for the dream outcome instead of the pain: what people say they want in general, the specific way that shows up, how it plays out in daily life once solved, and the deep emotional relief or pride underneath it.

Return ONLY valid JSON, no fences: escape any quote marks inside a string as \", and never put a literal line break inside a string value.
{"painChain":[{"rung":"one of the 4 ids above","text":"one to two sentences"}],"promiseLadder":[{"rung":"one of the 4 ids above","text":"one to two sentences"}]}`;
      const out = await requestForgeGeneration(prompt, 1800);
      const j = parseJSON(out);
      setPainChain(Array.isArray(j.painChain) ? j.painChain.slice(0, 4) : []);
      setPromiseLadder(Array.isArray(j.promiseLadder) ? j.promiseLadder.slice(0, 4) : []);
      markDone("ladder");
    } catch (e) { setError("Could not build the pain chain and promise ladder. " + ((e && e.message) || "Unknown error") + ". Try again, or fill Pain and Promise by hand."); }
    finally { setBusy(""); }
  }

  async function buildConditions() {
    setError("");
    if (!intake.offer.trim()) { setError("Fill in the offer first. Conditions needs a real offer to wrap."); return; }
    setBusy("conditions");
    try {
      const material = `OFFER: ${intake.offer}
${isLeadGen ? `LEAD MAGNET (the free next step): ${intake.leadOffer || "(not given)"}` : "OBJECTIVE: direct sale"}
PROOF ON HAND: ${JSON.stringify((avatar && avatar.proofTrusted) || (intake.proof ? [intake.proof] : []))}
EXISTING CONDITIONS TEXT, IF ANY: ${blocks.Conditions || "(none)"}`;
      const typesList = CONDITIONS_TYPES.map((t) => `${t.id}: ${t.name}, ${t.desc}`).join("\n");
      const prompt =
`You are a direct-response strategist writing the Conditions, the offer wrapper, in the Anvil framework.
${material}
${voiceLine()}${complianceLine()}

For each of these 5 fixed types, using the id exactly as written, each type exactly once, no repeats and none skipped:
${typesList}

Hard rule regardless of voice: never invent a deadline, a limited quantity, a guarantee, a bonus, or a term that is not actually stated in the material above. No manufactured urgency and no fake scarcity of any kind, in any type, in any voice. If the material above supports a type, write one real, specific sentence for it and set gap to false. If it does not, set gap to true, leave text empty, and instead write a short, specific question in askFor naming exactly the real fact you would need to fill it in, for example asking what the actual refund policy is, or whether there is a real deadline or limited capacity.

Return ONLY valid JSON, no fences: escape any quote marks inside a string as \", and never put a literal line break inside a string value.
{"conditions":[{"typeId":"one of the 5 ids above","text":"the real, specific sentence, or empty if gap is true","gap":false,"askFor":"the specific question to ask, or empty if gap is false"}]}`;
      const out = await requestForgeGeneration(prompt, 1800);
      const j = parseJSON(out);
      setConditionsResult(Array.isArray(j.conditions) ? j.conditions.slice(0, 5) : []);
      markDone("conditions");
    } catch (e) { setError("Could not build the conditions. " + ((e && e.message) || "Unknown error") + ". Try again, or fill the Conditions block by hand."); }
    finally { setBusy(""); }
  }

  async function checkOfferStrength() {
    setError("");
    if (!intake.core.trim() && !intake.offer.trim()) { setError("Add a core offer or a front-door offer in Step 0 first. This checks the offer, so it needs one to check."); return; }
    setBusy("offerStrength");
    try {
      const material = `CORE PAID OFFER: ${intake.core || "(not given)"}
FRONT-DOOR OFFER: ${intake.offer || chosenOffer || manualOffer || "(not given)"}
AUDIENCE: ${intake.audience || intake.niche || "(not given)"}
STRUGGLE: ${intake.struggle || "(not given)"}
DREAM OUTCOME: ${intake.dream || "(not given)"}
HESITATION: ${intake.hesitation || "(not given)"}
PROOF ON HAND: ${intake.proof || "(not given)"}
AVATAR ON FILE: ${avatar ? "yes, use it" : "no"}${avatar ? `
AVATAR PAINS: ${JSON.stringify(avatar.pains || [])}
AVATAR DREAM OUTCOMES: ${JSON.stringify(avatar.dreamOutcomes || [])}
AVATAR PROOF TRUSTED: ${JSON.stringify(avatar.proofTrusted || [])}
AVATAR OBJECTIONS: ${JSON.stringify(avatar.objections || [])}` : ""}
BLOCKS FILLED SO FAR: ${BLOCK_NAMES.filter((n) => blocks[n].trim()).join(", ") || "(none yet)"}`;
      const factorList = OFFER_STRENGTH_FACTORS.map((f) => `${f.id}: ${f.desc}`).join("\n");
      const prompt =
`You are a direct-response strategist checking the strength of an offer before any ad copy gets written, in the Anvil framework.
${material}
${voiceLine()}${complianceLine()}

The value of an offer comes down to 5 factors: Promise times Proof times Curiosity, divided by Constraints times Conditions. A stronger offer has a bigger, clearer promise, more believable proof, more genuine curiosity or pull, and less friction from constraints and conditions. This is a lens for thinking, never a score, never a number, never a tier or grade of any kind, do not invent one.

For each of these 5 fixed factors, using the id exactly as written, each factor exactly once, no repeats and none skipped:
${factorList}

Assess only using what is actually given above, never invent a detail about the offer that was not stated. If there is not enough material yet to assess a factor, set gap to true, leave assessment empty, and write a short, specific question in askFor naming exactly what you would need to know. Otherwise set gap to false, write one or two sentences on what is currently strong or thin about that factor, and one concrete, specific suggestion for tightening it.

Then write one closing sentence in biggestLever naming which single factor is the most worth fixing before writing copy, and why, grounded in what you actually assessed above.

Return ONLY valid JSON, no fences: escape any quote marks inside a string as \", and never put a literal line break inside a string value.
{"factors":[{"factorId":"one of the 5 ids above","assessment":"the assessment, or empty if gap is true","suggestion":"the concrete suggestion, or empty if gap is true","gap":false,"askFor":"the specific question, or empty if gap is false"}],"biggestLever":"one closing sentence"}`;
      const out = await requestForgeGeneration(prompt, 1800);
      const j = parseJSON(out);
      setOfferStrength(Array.isArray(j.factors) ? j.factors.slice(0, 5) : []);
      setOfferStrengthLever(typeof j.biggestLever === "string" ? j.biggestLever : "");
      markDone("offerStrength");
    } catch (e) { setError("Could not check the offer strength. " + ((e && e.message) || "Unknown error") + ". Try again."); }
    finally { setBusy(""); }
  }

  // Segment builder Milestone 2: compose personas from the WHAT/WHO/WHY inputs.
  // Grounds every persona in what was actually entered, an outcome, demographic
  // values, and up to 2 facets, never inventing a new one. The say-it test and
  // the gate are asked for in the prompt, and the facet-count and existence
  // checks are also enforced here in code, not just asked for, since prompt-only
  // rules have not held reliably for grounding elsewhere in this app.
  function groundPersona(p, map) {
    if (!p || typeof p !== "object") return null;
    const outcome = map.outcomes.find((o) => o.name.trim().toLowerCase() === String(p.outcomeName || "").trim().toLowerCase());
    if (!outcome) return null; // references an outcome that was never entered, discard rather than invent
    const demographics = {};
    if (p.demographics && typeof p.demographics === "object") {
      for (const groupId of Object.keys(p.demographics)) {
        const val = p.demographics[groupId];
        if (Array.isArray(map.demographics[groupId]) && map.demographics[groupId].includes(val)) demographics[groupId] = val;
      }
    }
    const facets = Array.isArray(p.facets)
      ? p.facets.filter((f) => f && Array.isArray(map.facets[f.familyId]) && map.facets[f.familyId].includes(f.value)).slice(0, 2)
      : [];
    return { id: Date.now() + Math.random(), name: String(p.name || "").trim(), description: String(p.description || "").trim(), outcomeId: outcome.id, outcomeName: outcome.name, demographics, facets };
  }

  async function composePersonas() {
    setError("");
    if (segmentMap.outcomes.length === 0) { setError("Add at least one outcome first. A persona needs a real outcome to be built around."); return; }
    const hasWhoWhy = Object.values(segmentMap.demographics).some((v) => v.length > 0) || Object.values(segmentMap.facets).some((v) => v.length > 0);
    if (!hasWhoWhy) { setError("Add at least some demographics or facets first. A persona is more than just an outcome."); return; }
    setBusy("personas");
    try {
      const outcomesText = segmentMap.outcomes.map((o) => `${o.name} [lens: ${o.lens}]${o.subOutcomes.length ? ", sub-outcomes: " + o.subOutcomes.join("; ") : ""}`).join("\n");
      const demographicsText = DEMOGRAPHIC_GROUPS.map((g) => `${g.id}: ${JSON.stringify(segmentMap.demographics[g.id])}`).join("\n");
      const facetsText = FACET_FAMILIES.map((f) => `${f.id}: ${JSON.stringify(segmentMap.facets[f.id])}`).join("\n");
      const prompt =
`You are composing real, distinct buyer personas from a market already sliced into outcomes, demographics, and facets, in the Anvil segment builder.
SCOPE: ${segmentMap.scope || "(not given)"}
OUTCOMES:
${outcomesText}
DEMOGRAPHICS:
${demographicsText}
FACETS:
${facetsText}
${voiceLine()}${complianceLine()}

A persona is a coordinate: exactly one outcome from the list above, plus one or more demographic values from the lists above, plus exactly one or two facets from the lists above. Use only values that are actually listed, word for word, never invent a new outcome, demographic, or facet. Never use three or more facets in one persona, that describes one person in a forum thread, not a real pocket of buyers.

Apply two tests to every candidate before keeping it:
- The say-it test. Would a real customer say this out loud, as who they are and what they want? If it reads like a marketer's abstraction, drop it.
- The gate. Only keep a persona if it would need a meaningfully different ad than every other persona you keep. If two candidates would run the same ad, they are the same persona, merge them into one or drop the redundant one.

The power move is stacking two facets from different families to find a real pocket nobody targets, for example a retiree who is also afraid of the procedure, not just a retiree. Only stack two facets when it is a clearly different, real group of people, not a more specific description of the same one persona.

Return between 2 and 6 personas, only as many as actually pass the gate. Fewer strong personas beats many overlapping ones. Give each a short, plain, natural name a strategist would actually use, not a joke name or a caricature, and a one-line description a real person in this group might recognize themselves in.

Return ONLY valid JSON, no fences: escape any quote marks inside a string as \", and never put a literal line break inside a string value.
{"personas":[{"name":"...","description":"one sentence","outcomeName":"the exact outcome name from the list above","demographics":{"groupId":"one exact value from that group's list"},"facets":[{"familyId":"...","value":"one exact value from that family's list"}]}]}`;
      const out = await requestForgeGeneration(prompt, 2000);
      const j = parseJSON(out);
      const grounded = (Array.isArray(j.personas) ? j.personas : []).map((p) => groundPersona(p, segmentMap)).filter(Boolean).slice(0, 6);
      setSegmentMap((s) => ({ ...s, personas: grounded }));
      markDone("personas");
    } catch (e) { setError("Could not compose personas. " + ((e && e.message) || "Unknown error") + ". Try again."); }
    finally { setBusy(""); }
  }

  function removePersona(id) {
    setSegmentMap((s) => ({ ...s, personas: s.personas.filter((p) => p.id !== id) }));
  }

  async function recommendTemplate() {
    setError("");
    if (!intake.offer.trim()) { setError("Add what you sell so the engine can match a template."); return; }
    setBusy("recommend");
    try {
      const list = TEMPLATES.map((t) => `${t.id}. ${t.name} - ${t.when}`).join("\n");
      const prompt = `Pick the single best ad template for this offer.\nOFFER: ${intake.offer}\nMARKET: ${intake.audience || "infer"}\n${blocks.Curiosity ? "ANGLE: " + blocks.Curiosity : ""}\nTEMPLATES:\n${list}\n${voiceLine()}\nReturn ONLY JSON: {"id": <number>, "reason": "<one sentence>"}`;
      const out = await requestForgeGeneration(prompt);
      const j = parseJSON(out);
      setRecommended({ id: j.id, reason: j.reason });
      setTemplateId("auto");
      markDone("recommend");
    } catch (e) { setError("Could not recommend. " + ((e && e.message) || "Unknown error") + ". Pick a template from the menu."); }
    finally { setBusy(""); }
  }

  async function generateOffers(steer) {
    setError("");
    if (!intake.core.trim()) { setError("Add your core offer first."); return; }
    setBusy("offers");
    try {
      const steerLine = steer && steer.trim()
        ? `\nWHAT THE USER HAS IN MIND / WANTS ADJUSTED: ${steer.trim()}\nHonor this. If it is a specific idea, make a sharpened version of it the first option, then add complementary alternatives. If it is an adjustment, move the whole set in that direction.`
        : "";
      const prompt =
`You are a direct-response offer strategist. Generate 6 distinct front-door (foot-in-the-door) offers that get a stranger in this niche to say yes to a first small step, which then leads to the core paid offer.
CORE PAID OFFER: ${intake.core}
NICHE: ${intake.niche || "(infer a sensible target)"}
${voiceLine()}${steerLine}

Spread across DIFFERENT archetypes, do not repeat one. Draw from: free audit or assessment, free sample or trial, free training / workshop / mini-course, free tool / template / checklist, teardown or review of their current setup, scorecard or quiz, low-cost tripwire. Each offer must be specific to this niche and this core. Prefer low-friction, credible offers, and avoid hypey free-money framing for trust-heavy or regulated niches.

Return ONLY JSON, no fences:
{"offers":[{"name":"the offer, specific and concrete","type":"the archetype","why":"why it fits this niche, one line","bridge":"how it naturally leads to the core paid offer, one line","friction":"low|medium|high"}]}`;
      const out = await requestForgeGeneration(prompt);
      const j = parseJSON(out);
      setOffers(Array.isArray(j.offers) ? j.offers.slice(0, 6) : []);
      markDone("offers");
    } catch (e) { setError("Could not generate offers. " + ((e && e.message) || "Unknown error") + ". Try again."); }
    finally { setBusy(""); }
  }

  function useManualOffer() {
    if (!manualOffer.trim()) { setError("Type your front-door offer first."); return; }
    applyOffer({ name: manualOffer.trim(), type: "your own offer" });
  }

  function applyOffer(o) {
    setIntake((s) => ({ ...s, offer: o.name, audience: s.audience || s.niche, leadOffer: o.name, objective: "Lead generation" }));
    setChosenOffer(o.name);
    setAvatar(null);
    setBlocks({ Pain: "", Promise: "", Proof: "", Constraints: "", Curiosity: "", Conditions: "" });
    setSelectedAngle({ family: "", subtype: "" });
    setNotes({});
    setRecommended(null);
    setTemplateId("auto");
  }

  function makeAd(j, extra) {
    const segs = Array.isArray(j.primaryText) ? j.primaryText.filter((s) => s && s.text) : [];
    const awStage = AWARENESS_STAGES.find((s) => s.id === intake.awareness);
    return {
      kind: "ad", platform, brand, domain, objective: intake.objective, template: activeTemplate,
      primaryText: segs, headline: j.headline || "", description: j.description || "",
      cta: CTA_OPTIONS.includes(j.cta) ? j.cta : ctaList[0], imageHeadline: j.imageHeadline || "", imageSubline: j.imageSubline || "",
      craves: j.craves || {}, hooks: Array.isArray(j.hooks) ? j.hooks.slice(0, 3) : [], creativeBrief: j.creativeBrief || "",
      copyVelocity: cv(segs), words: segs.reduce((a, s) => a + wordCount(s.text), 0),
      personaName: activePersona ? activePersona.name : "", awarenessLabel: awStage ? awStage.label : "",
      angleFamily: selectedAngle.family, angleSubtype: selectedAngle.subtype,
      ...extra,
    };
  }
  const scrollResults = () => setTimeout(() => resultsRef.current && resultsRef.current.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  const scrollAvatar = () => setTimeout(() => avatarRef.current && avatarRef.current.scrollIntoView({ behavior: "smooth", block: "start" }), 90);

  async function generateAd() {
    setError("");
    if (!intake.offer.trim()) { setError("Add what you sell to generate an ad."); return; }
    if (intake.regulated && !complianceAck) { setError("This is marked a regulated vertical. Acknowledge the compliance step in settings before generating."); return; }
    if (isSearch) return generateRSA();
    const tpl = activeTemplate;
    if (!tpl) { setError("Pick a template, or hit Recommend."); return; }
    const exampleLeadBlock = getPrimaryTextExampleBlock(intake.awareness, hasGroundedConditions, tpl.leadBlock, hasGroundedProof);
    setBusy("generate");
    try {
      const prompt =
`You are an elite direct-response copywriter producing a ${platform} ad in the Anvil framework, shaped to the platform's fields.
OFFER: ${intake.offer}
MARKET: ${intake.audience || "infer"}
${objectiveLine()}${awarenessLine()}${personaLine()}
${avatar ? "AVATAR: " + JSON.stringify(avatar) : ""}
COPY BLOCKS:
${blockText()}
TEMPLATE: ${tpl.name}
STRUCTURE: Opening = ${tpl.opening}; Middle = ${tpl.middle}; Close = ${tpl.close}
Template labels describe rhetorical shape only. They do not supply proof, exclusivity, speed, urgency, deadlines, guarantees, or offer terms.

${buildPlacementGuidance(platform, intake.awareness)}

Output rules:
- primaryText: follow the platform-specific PRIMARY TEXT CONTRACT above. Each segment must add new information and use its dominant Anvil block as the block label.
- headline: 40 chars max, crystallize the Promise.
- description: 30 chars max.
- cta: choose ONE exactly from: ${ctaList.join(", ")}.
- imageHeadline: 7 words max. imageSubline: 8 words max.
- creativeBrief: 2 to 4 sentences for whoever shoots or designs the image, not the copywriter. Say what must actually be visible in the frame, one concrete detail tied to this offer or its proof, never a generic stock-photo description like "happy customer" or "person on phone." Say the mood or style in plain terms. Name one specific thing to avoid, the cliche this category always falls into. If you do not have enough to make it concrete, say so plainly instead of padding it with generic direction.
Apply Polish and use the customer's real voice. Clarity comes first. Use only the blocks that earn their place; never pad or cram to inflate the count. Avoid high-saturation angles. Before returning JSON, remove every sentence that restates an earlier sentence without adding a distinct fact, implication, objection, or action.

Return ONLY JSON, no fences:
{"primaryText":[{"block":"${exampleLeadBlock}","text":"..."}],"headline":"","description":"","cta":"${ctaList[0]}","imageHeadline":"","imageSubline":"","craves":{"Clear":4,"Relevant":5,"Accurate":4,"Visual":5,"Expressive":4,"Specific":5},"hooks":["","",""],"creativeBrief":""}
craves 1-5. Exactly 3 hooks.`;
      const out = await requestForgeGeneration(prompt);
      setResults((r) => [{ id: Date.now(), ...makeAd(parseJSON(out)) }, ...r]);
      markDone("generate"); scrollResults();
    } catch (e) { setError("Generation failed. " + ((e && e.message) || "Came back malformed") + ". Try again."); }
    finally { setBusy(""); }
  }

  async function generateRSA() {
    setError("");
    if (!intake.offer.trim()) { setError("Add what you sell to generate search ads."); return; }
    if (intake.regulated && !complianceAck) { setError("This is marked a regulated vertical. Acknowledge the compliance step in settings before generating."); return; }
    setBusy("generate");
    try {
      const prompt =
`You are writing a Google Responsive Search Ad in the Anvil framework.
OFFER: ${intake.offer}
MARKET: ${intake.audience || "infer"}
BRAND: ${brand}
${objectiveLine()}${awarenessLine()}${personaLine()}
${avatar ? "AVATAR: " + JSON.stringify(avatar) : ""}
COPY BLOCKS:
${blockText()}

Produce a complete asset set Google can mix and match:
- 15 distinct headlines, each ${HL_MAX} characters or fewer. Spread across the grounded themes available here: Curiosity hooks, Promise/benefit, keyword-forward service or brand language, and any supplied Proof or Conditions. Use Proof and Conditions only when those blocks contain supplied facts or terms. At least 4 headlines must contain the main service keyword. Each headline stands alone and adds a distinct angle.
- 4 descriptions, each ${DESC_MAX} characters or fewer, blending distinct grounded material from the available Promise, Proof, and CTA inputs. Omit Proof or Conditions when they are absent. ${isLeadGen ? (intake.leadOffer.trim() ? `For lead generation, use the supplied next step exactly: ${intake.leadOffer.trim()}.` : "For lead generation, no next-step offer was supplied. Use a neutral Learn More or Contact Us CTA and do not invent a free offer or other terms.") : "For direct sale, use an allowed sales CTA without inventing price, availability, or terms."}
- 2 display paths, each ${PATH_MAX} characters or fewer.
Respect every character limit. Return ONLY JSON, no fences:
{"headlines":["",""],"descriptions":["","","",""],"paths":["",""]}`;
      const out = await requestForgeGeneration(prompt);
      const j = parseJSON(out);
      const awStage = AWARENESS_STAGES.find((s) => s.id === intake.awareness);
      setResults((r) => [{
        kind: "rsa", id: Date.now(), platform: "Google Search", brand, domain, objective: intake.objective,
        headlines: (Array.isArray(j.headlines) ? j.headlines : []).filter(Boolean).slice(0, 15),
        descriptions: (Array.isArray(j.descriptions) ? j.descriptions : []).filter(Boolean).slice(0, 4),
        paths: (Array.isArray(j.paths) ? j.paths : []).filter(Boolean).slice(0, 2),
        personaName: activePersona ? activePersona.name : "", awarenessLabel: awStage ? awStage.label : "",
      }, ...r]);
      markDone("generate"); scrollResults();
    } catch (e) { setError("Could not build the search ads. " + ((e && e.message) || "Unknown error") + ". Try again."); }
    finally { setBusy(""); }
  }

  async function generateTestSet() {
    setError("");
    if (!intake.offer.trim()) { setError("Add what you sell to run a test."); return; }
    if (intake.regulated && !complianceAck) { setError("This is marked a regulated vertical. Acknowledge the compliance step in settings before generating."); return; }
    if (isSearch) { setError("For Google Search, generate the asset set. Google rotates the headlines and descriptions for you. Use the A/B lab on a feed or video placement."); return; }
    const tpl = activeTemplate;
    if (!tpl) { setError("Pick a template, or hit Recommend."); return; }
    const exampleLeadBlock = getPrimaryTextExampleBlock(intake.awareness, hasGroundedConditions, tpl.leadBlock, hasGroundedProof);
    setBusy("test");
    try {
      const axis = testAxis, n = testCount;
      const variesAngle = axis === "Angle (big idea)";
      const rule = {
        "Hook": `Only the opening hook (the first ${exampleLeadBlock} segment for this awareness stage) may differ between variants. Make each hook a distinctly different angle. EVERY other field must be identical across all variants.`,
        "Headline": "Only the headline may differ (40 chars max each). EVERY other field identical across variants.",
        "Image headline": "Only imageHeadline and imageSubline may differ. EVERY other field identical across variants.",
        "CTA": `Only the cta may differ; each must be exactly one of: ${ctaList.join(", ")}. EVERY other field identical across variants.`,
        "Angle (big idea)": "Each variant tests a DIFFERENT big idea using a different angle grid cell. Set angleFamily to curiosity-grid and angleSubtype to exactly one of market_problem, market_solution, your_problem, or your_solution. Use a different subtype for each variant. The whole ad changes to fit the angle.",
      }[axis];
      const angleMetadataRule = variesAngle
        ? "Return the exact angleFamily and angleSubtype used by each variant."
        : selectedAngle.family
          ? `Every variant preserves the selected angle metadata exactly: angleFamily ${selectedAngle.family}; angleSubtype ${selectedAngle.subtype}.`
          : "No named angle family or subtype was selected. Return empty strings for angleFamily and angleSubtype instead of inventing labels.";
      const prompt =
`You are running a single-variable A/B test of ${n} ad variants for a ${platform} ad in the Anvil framework.
OFFER: ${intake.offer}
MARKET: ${intake.audience || "infer"}
${objectiveLine()}${awarenessLine()}${personaLine()}
${avatar ? "AVATAR: " + JSON.stringify(avatar) : ""}
COPY BLOCKS:
${blockText()}
TEMPLATE: ${tpl.name} (Opening ${tpl.opening}; Middle ${tpl.middle}; Close ${tpl.close})
Template labels describe rhetorical shape only. They do not supply proof, exclusivity, speed, urgency, deadlines, guarantees, or offer terms.

${buildPlacementGuidance(platform, intake.awareness)}

TEST VARIABLE: ${axis}.
${rule}
${angleMetadataRule}
Variant A is the control. Give each variant a short note on what makes it different.
Each variant is a full ad. Every primaryText must follow the same platform-specific contract above and begin with the awareness-appropriate block. State each idea once. cta must be from the allowed list.

Return ONLY JSON, no fences:
{"variable":"${axis}","hypothesis":"one line: what we expect to learn","metric":"the first number to watch","nextTest":"what to test after a winner","variants":[{"label":"A","note":"","angleFamily":"","angleSubtype":"","primaryText":[{"block":"${exampleLeadBlock}","text":""}],"headline":"","description":"","cta":"${ctaList[0]}","imageHeadline":"","imageSubline":""}]}`;
      const out = await requestForgeGeneration(prompt);
      const j = parseJSON(out);
      const variants = (Array.isArray(j.variants) ? j.variants : []).map((v, i) => {
        const validGridSubtype = CURIOSITY_QUADRANTS.some((quadrant) => quadrant.id === v.angleSubtype);
        return {
          id: Date.now() + i + 1,
          ...makeAd(v, {
            label: v.label || String.fromCharCode(65 + i),
            note: v.note || "",
            isControl: i === 0,
            angleFamily: variesAngle ? (validGridSubtype ? "curiosity-grid" : "") : selectedAngle.family,
            angleSubtype: variesAngle ? (validGridSubtype ? v.angleSubtype : "") : selectedAngle.subtype,
          }),
        };
      });
      setResults((r) => [{ kind: "test", id: Date.now(), platform, variable: j.variable || axis, hypothesis: j.hypothesis || "", metric: j.metric || "", nextTest: j.nextTest || "", variants, personaName: activePersona ? activePersona.name : "" }, ...r]);
      markDone("test"); scrollResults();
    } catch (e) { setError("Could not build the test set. " + ((e && e.message) || "Unknown error") + ". Try fewer variants, or try again."); }
    finally { setBusy(""); }
  }

  const label = { fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "#6b6b70", marginBottom: 6, display: "block" };
  const field = { width: "100%", boxSizing: "border-box", border: "1px solid #e2e2e6", borderRadius: 8, padding: "10px 12px", fontSize: 14, fontFamily: "inherit", color: "#141414", outline: "none", background: "#fff" };
  const btn = { fontFamily: "inherit", fontWeight: 700, fontSize: 13, borderRadius: 8, padding: "10px 14px", cursor: "pointer", border: "1px solid #141414", background: "#141414", color: "#fff", display: "inline-flex", alignItems: "center", gap: 8 };
  const btnGhost = { ...btn, background: "#fff", color: "#141414" };
  const btnWork = { background: "#9a7a0c", border: "1px solid #9a7a0c", color: "#fff" };
  const btnDone = { background: "#1B7A43", border: "1px solid #1B7A43", color: "#fff" };
  const btnState = (key, base) => busy === key ? { ...base, ...btnWork } : done === key ? { ...base, ...btnDone } : base;
  const card = { background: "#fff", border: "1px solid #ececef", borderRadius: 14, padding: 18 };
  const step = (n) => <span style={{ display: "inline-flex", width: 20, height: 20, borderRadius: "50%", background: "#141414", color: "#fff", fontSize: 11, fontWeight: 800, alignItems: "center", justifyContent: "center", marginRight: 8 }}>{n}</span>;

  const intakeFields = [
    { k: "offer", q: "What is this ad promoting?", ph: "The offer this specific ad sells. If you used Step 0, this is your front-door offer, which leads to your core. Otherwise, just what you sell.", req: true, min: 64 },
    { k: "audience", q: "Who is it for?", ph: "Leave blank to let the engine infer.", min: 48 },
    { k: "struggle", q: "What do customers struggle with before they find you?", ph: "What they complain about. Optional.", min: 48 },
    { k: "dream", q: "What do they wish were true?", ph: "The result they are chasing. Optional.", min: 48 },
    { k: "hesitation", q: "What makes people hesitate to buy?", ph: "Doubts and objections. Optional.", min: 48 },
    { k: "proof", q: "What proof do you have?", ph: "Results, testimonials, credentials, data, guarantees. Optional.", min: 48 },
  ];
  const conf = avatar && CONF[avatar.confidence] ? CONF[avatar.confidence] : CONF.low;

  if (forgeAuthLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f6f6f7", fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", color: "#141414" }}>
        Reading your Forge session…
      </div>
    );
  }

  if (!forgeSession) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f6f6f7", fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setForgeAuthError("");
            setForgeAuthLoading(true);
            try {
              const session = await signInToForge(
                forgeAuthEmail,
                forgeAuthPassword,
              );
              setForgeSession(session);
            } catch (authError) {
              setForgeAuthError(
                authError instanceof Error
                  ? authError.message
                  : "Forge sign-in failed.",
              );
            } finally {
              setForgeAuthLoading(false);
            }
          }}
          style={{ background: "#fff", border: "1px solid #ececef", borderRadius: 14, padding: 28, width: 320, boxSizing: "border-box" }}
        >
          <h2 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 800, color: "#141414" }}>Anvil</h2>
          <p style={{ margin: "0 0 16px", fontSize: 13, color: "#6b6b70", lineHeight: 1.5 }}>
            Sign in with your existing Prompted Forge account. Access,
            generation limits, and model capacity are governed by Forge.
          </p>
          {!forgeRuntimeConfigured ? (
            <p style={{ margin: "0 0 12px", fontSize: 12, color: "#8a1c22", lineHeight: 1.45 }}>
              Forge runtime is not configured for this deployment.
            </p>
          ) : null}
          <input
            type="email"
            autoFocus
            autoComplete="email"
            value={forgeAuthEmail}
            onChange={(e) => setForgeAuthEmail(e.target.value)}
            placeholder="Forge email"
            style={{ width: "100%", boxSizing: "border-box", border: "1px solid #e2e2e6", borderRadius: 8, padding: "10px 12px", fontSize: 14, marginBottom: 12 }}
          />
          <input
            type="password"
            autoComplete="current-password"
            value={forgeAuthPassword}
            onChange={(e) => setForgeAuthPassword(e.target.value)}
            placeholder="Password"
            style={{ width: "100%", boxSizing: "border-box", border: "1px solid #e2e2e6", borderRadius: 8, padding: "10px 12px", fontSize: 14, marginBottom: 12 }}
          />
          {forgeAuthError ? (
            <p role="alert" style={{ margin: "0 0 12px", fontSize: 12, color: "#8a1c22", lineHeight: 1.45 }}>
              {forgeAuthError}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={!forgeRuntimeConfigured || forgeAuthLoading}
            style={{ width: "100%", fontFamily: "inherit", fontWeight: 700, fontSize: 13, borderRadius: 8, padding: "10px 14px", cursor: "pointer", border: "1px solid #141414", background: "#141414", color: "#fff", opacity: !forgeRuntimeConfigured || forgeAuthLoading ? 0.55 : 1 }}
          >
            {forgeAuthLoading ? "Signing in…" : "Sign in to Forge"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", color: "#141414", background: "#f6f6f7", minHeight: "100vh", padding: "0 0 64px" }}>
      <style>{`
        @keyframes cbae-spin { to { transform: rotate(360deg) } }
        .cbae-spin { animation: cbae-spin .7s linear infinite }
        *:focus-visible { outline: 2px solid #141414; outline-offset: 2px }
        @media (prefers-reduced-motion: reduce){ .cbae-spin{ animation:none } *{ scroll-behavior:auto !important } }
        .cbae-grid { display:grid; grid-template-columns: 1fr; gap:20px }
        @media (min-width: 920px){ .cbae-grid { grid-template-columns: 400px 1fr } }
        textarea { resize: vertical }
      `}</style>

      <header style={{ background: "#141414", color: "#fff", padding: "26px 22px 30px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ display: "flex", gap: 5, marginBottom: 14 }}>{BLOCK_NAMES.map((n) => <span key={n} title={n} style={{ width: 26, height: 6, borderRadius: 2, background: BLOCKS[n].color }} />)}</div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".22em", textTransform: "uppercase", color: "#9a9aa0" }}>Prompted Forge</div>
            <button
              type="button"
              onClick={async () => {
                setForgeAuthError("");
                try {
                  await signOutOfForge();
                  setForgeSession(null);
                } catch (authError) {
                  setForgeAuthError(
                    authError instanceof Error
                      ? authError.message
                      : "Forge sign-out failed.",
                  );
                }
              }}
              style={{ fontFamily: "inherit", fontSize: 11, fontWeight: 700, borderRadius: 7, padding: "6px 9px", cursor: "pointer", border: "1px solid #45454a", background: "transparent", color: "#d4d4d8" }}
            >
              Sign out
            </button>
          </div>
          <h1 style={{ margin: "4px 0 0", fontSize: 38, fontWeight: 800, letterSpacing: "-.03em", lineHeight: 1.02 }}>Anvil</h1>
          <p style={{ margin: "10px 0 0", maxWidth: 700, color: "#c9c9ce", fontSize: 14.5, lineHeight: 1.5 }}>
            From your offer to finished ads, A/B test sets, or a full search ad asset set, tuned to your objective and voice, previewed per placement. Built for Meta, LinkedIn, TikTok, YouTube Shorts, and Google Search.
          </p>
        </div>
      </header>

      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 22px 0" }}>
        <AnvilMarketwareExtensions
          selectedPlatform={platform}
          onSelectPlatform={setPlatform}
          draftContext={{ objective: intake.objective, audience: intake.audience, offer: intake.offer }}
        />
        <div id="anvil-generator-workspace" className="cbae-grid">
          {/* LEFT */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <section style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>{step(0)}Find the offer</h2>
                <span style={{ fontSize: 11, color: "#9a9aa0" }}>optional</span>
              </div>
              <p style={{ margin: "0 0 12px", fontSize: 12.5, color: "#6b6b70", lineHeight: 1.5 }}>Two different things live here. Your <strong>core offer</strong> is the paid thing you ultimately sell. The <strong>front-door offer</strong> is the free first step that gets a stranger to say yes and leads to the core. Set the core, then land the front-door offer below.</p>
              <label style={label}>Your core offer (the paid thing you ultimately sell)</label>
              <textarea style={{ ...field, minHeight: 52 }} value={intake.core} onChange={(e) => setIn("core", e.target.value)} placeholder="e.g. Done-for-you content creation" />
              <div style={{ height: 10 }} />
              <label style={label}>Target niche</label>
              <input style={field} value={intake.niche} onChange={(e) => setIn("niche", e.target.value)} placeholder="e.g. Real estate companies and agents" />

              <div style={{ height: 14 }} />
              <label style={label}>The front-door offer</label>
              <div style={{ display: "flex", gap: 4, background: "#ececef", padding: 4, borderRadius: 10, marginBottom: 12 }}>
                {[["manual", "I have my offer"], ["refine", "Refine my idea"], ["brainstorm", "Help me brainstorm"]].map(([v, t]) => (
                  <button key={v} onClick={() => setFrontMode(v)} style={{ flex: 1, fontFamily: "inherit", fontWeight: 700, fontSize: 12, padding: "8px 4px", borderRadius: 7, cursor: "pointer", border: "none", background: frontMode === v ? "#fff" : "transparent", color: frontMode === v ? "#141414" : "#6b6b70", boxShadow: frontMode === v ? "0 1px 2px rgba(0,0,0,.08)" : "none" }}>{t}</button>
                ))}
              </div>

              {frontMode === "manual" && (
                <>
                  <textarea style={{ ...field, minHeight: 60 }} value={manualOffer} onChange={(e) => setManualOffer(e.target.value)} placeholder="Type your front-door offer, e.g. Free listing-ad teardown for one property" />
                  <div style={{ height: 10 }} />
                  <button style={{ ...btn, justifyContent: "center", width: "100%", padding: 12 }} onClick={useManualOffer}>Use this offer</button>
                </>
              )}
              {frontMode === "refine" && (
                <>
                  <textarea style={{ ...field, minHeight: 60 }} value={offerSteer} onChange={(e) => setOfferSteer(e.target.value)} placeholder="What you have in mind, e.g. some kind of free workshop on listing ads, not an audit" />
                  <div style={{ height: 10 }} />
                  <button style={btnState("offers", { ...btn, justifyContent: "center", width: "100%", padding: 12 })} onClick={() => generateOffers(offerSteer)} disabled={busy === "offers"}>{busy === "offers" ? <><Spinner /> Refining</> : "Refine into options"}</button>
                </>
              )}
              {frontMode === "brainstorm" && (
                <button style={btnState("offers", { ...btn, justifyContent: "center", width: "100%", padding: 12 })} onClick={() => generateOffers("")} disabled={busy === "offers"}>{busy === "offers" ? <><Spinner /> Finding offers</> : "Suggest front-door offers"}</button>
              )}

              {offers.length > 0 && (
                <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                  {offers.map((o, i) => {
                    const fr = o.friction === "high" ? "#E8242B" : o.friction === "medium" ? "#9a7a0c" : "#1B7A43";
                    const chosen = chosenOffer === o.name;
                    return (
                      <div key={i} style={{ border: chosen ? "2px solid #141414" : "1px solid #ececef", borderRadius: 12, padding: 12, background: chosen ? "#fafafa" : "#fff" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                          <div style={{ fontSize: 14.5, fontWeight: 800, color: "#141414", lineHeight: 1.25 }}>{o.name}</div>
                          {o.friction && <Chip text={o.friction + " friction"} color={fr} />}
                        </div>
                        {o.type && <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: "#8E3B8E", margin: "4px 0 6px" }}>{o.type}</div>}
                        {o.why && <div style={{ fontSize: 12.5, color: "#3a3a3e", lineHeight: 1.45, marginBottom: 4 }}><strong>Why it fits:</strong> {o.why}</div>}
                        {o.bridge && <div style={{ fontSize: 12.5, color: "#3a3a3e", lineHeight: 1.45, marginBottom: 8 }}><strong>Leads to your core:</strong> {o.bridge}</div>}
                        <button style={{ ...btnGhost, padding: "7px 12px", fontSize: 12.5 }} onClick={() => applyOffer(o)}>{chosen ? "Selected · loaded below" : "Use this offer"}</button>
                      </div>
                    );
                  })}
                  <div style={{ borderTop: "1px solid #f0f0f2", paddingTop: 12, marginTop: 2 }}>
                    <label style={label}>Not quite right? Tell Anvil what to change</label>
                    <textarea style={{ ...field, minHeight: 46 }} value={offerSteer} onChange={(e) => setOfferSteer(e.target.value)} placeholder="e.g. more like a workshop, less audit. Or: make it about listing photos." />
                    <div style={{ height: 8 }} />
                    <button style={btnState("offers", { ...btnGhost, justifyContent: "center", width: "100%" })} onClick={() => generateOffers(offerSteer)} disabled={busy === "offers"}>{busy === "offers" ? <><Spinner /> Regenerating</> : "Regenerate around this"}</button>
                  </div>
                </div>
              )}

              {(intake.core.trim() || intake.offer.trim()) && (
                <div style={{ marginTop: 14, borderTop: "1px solid #f0f0f2", paddingTop: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                    <label style={label}>Offer strength check</label>
                    <button style={btnState("offerStrength", { ...btnGhost, padding: "6px 10px", fontSize: 12 })} onClick={checkOfferStrength} disabled={busy === "offerStrength"}>{busy === "offerStrength" ? <><Spinner /> Checking</> : "Check the offer"}</button>
                  </div>
                  <p style={{ margin: "0 0 10px", fontSize: 12, color: "#9a9aa0", lineHeight: 1.45 }}>A thinking aid on the offer itself, before any copy gets written. Not a score.</p>
                  {offerStrength.length > 0 && (
                    <div>
                      {offerStrength.map((f, i) => {
                        const factor = OFFER_STRENGTH_FACTORS.find((x) => x.id === f.factorId);
                        const color = (BLOCKS[f.factorId] && BLOCKS[f.factorId].color) || "#6b6b70";
                        return (
                          <div key={i} style={{ marginBottom: 8 }}>
                            <Chip text={factor ? factor.label : f.factorId} color={color} />
                            {f.gap ? (
                              <div style={{ fontSize: 12.5, color: "#7A0E12", fontStyle: "italic", marginTop: 3 }}>{f.askFor || "Not enough on hand yet to assess this."}</div>
                            ) : (
                              <>
                                <div style={{ fontSize: 13, color: "#1f1f22", marginTop: 3 }}>{f.assessment}</div>
                                <div style={{ fontSize: 12.5, color: "#3a3a3e", marginTop: 2 }}><strong>Tighten it:</strong> {f.suggestion}</div>
                              </>
                            )}
                          </div>
                        );
                      })}
                      {offerStrengthLever && <div style={{ fontSize: 13, fontWeight: 700, color: "#141414", marginTop: 10, borderTop: "1px solid #f0f0f2", paddingTop: 10 }}>{offerStrengthLever}</div>}
                    </div>
                  )}
                </div>
              )}
            </section>

            <section style={card}>
              <h2 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 800 }}>Segment builder</h2>
              <p style={{ margin: "0 0 12px", fontSize: 12.5, color: "#6b6b70", lineHeight: 1.5 }}>Slice one product into several distinct, real buyers, WHAT they want, WHO they are, WHY they are here, instead of one flat avatar. Held here in memory for now. Ask at every entry: would a real customer say this out loud?</p>

              <label style={label}>Scope, which brand or client this belongs to</label>
              <input style={field} value={segmentMap.scope} onChange={(e) => setSegmentMap((s) => ({ ...s, scope: e.target.value }))} placeholder="e.g. Cary Dental, implants" />

              <div style={{ height: 16, borderTop: "1px solid #f0f0f2", marginTop: 14 }} />

              <div style={{ marginTop: 14, marginBottom: 4, fontSize: 12.5, fontWeight: 700, color: BLOCKS.Promise.ink }}>WHAT they want, the outcomes</div>
              <div style={{ fontSize: 11.5, color: "#9a9aa0", marginBottom: 8, lineHeight: 1.4 }}>Sorted by want, not by type. "Get my backyard back," not "less mosquito."</div>
              {segmentMap.outcomes.map((o) => {
                const lens = SEGMENT_OUTCOME_LENSES.find((l) => l.id === o.lens);
                return (
                  <div key={o.id} style={{ border: "1px solid #ececef", borderRadius: 10, padding: 10, marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <div><span style={{ fontWeight: 700, fontSize: 13.5 }}>{o.name}</span> <Chip text={lens ? lens.label : o.lens} color={BLOCKS.Promise.color} /></div>
                      <span onClick={() => removeOutcome(o.id)} style={{ cursor: "pointer", color: "#9a9aa0", fontWeight: 700 }}>×</span>
                    </div>
                    <TagList items={o.subOutcomes} onRemove={(i) => removeSubOutcome(o.id, i)} color={BLOCKS.Promise.color} />
                    <TagAdder onAdd={(t) => addSubOutcome(o.id, t)} placeholder="Add a sub-outcome" />
                  </div>
                );
              })}
              <OutcomeAdder onAdd={addOutcome} />

              <div style={{ marginTop: 18, marginBottom: 4, fontSize: 12.5, fontWeight: 700, color: BLOCKS.Constraints.ink }}>WHO they are, the demographics</div>
              <div style={{ fontSize: 11.5, color: "#9a9aa0", marginBottom: 8, lineHeight: 1.4 }}>Traits a stranger could tick from across the room. Buyer first, the payer may not be the user.</div>
              {DEMOGRAPHIC_GROUPS.map((g) => (
                <div key={g.id} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#3a3a3e" }}>{g.label}</div>
                  {g.desc && <div style={{ fontSize: 11, color: "#9a9aa0", marginBottom: 4 }}>{g.desc}</div>}
                  <TagList items={segmentMap.demographics[g.id]} onRemove={(i) => removeDemographic(g.id, i)} color={BLOCKS.Constraints.color} />
                  <TagAdder onAdd={(t) => addDemographic(g.id, t)} placeholder={`Add ${g.label.toLowerCase()}`} />
                </div>
              ))}

              <div style={{ marginTop: 18, marginBottom: 4, fontSize: 12.5, fontWeight: 700, color: BLOCKS.Curiosity.ink }}>WHY they are here, the facets</div>
              <div style={{ fontSize: 11.5, color: "#9a9aa0", marginBottom: 8, lineHeight: 1.4 }}>Find a belief they already hold. Never install one they do not.</div>
              {FACET_FAMILIES.map((f) => (
                <div key={f.id} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#3a3a3e" }}>{f.label}</div>
                  <div style={{ fontSize: 11, color: "#9a9aa0", marginBottom: 4 }}>{f.desc}</div>
                  <TagList items={segmentMap.facets[f.id]} onRemove={(i) => removeFacet(f.id, i)} color={BLOCKS.Curiosity.color} />
                  <TagAdder onAdd={(t) => addFacet(f.id, t)} placeholder={`Add a ${f.label.toLowerCase()} facet`} />
                </div>
              ))}

              <div style={{ marginTop: 18, borderTop: "1px solid #f0f0f2", paddingTop: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: "#141414" }}>Personas, composed from the above</div>
                  <button style={btnState("personas", { ...btnGhost, padding: "6px 10px", fontSize: 12 })} onClick={composePersonas} disabled={busy === "personas"}>{busy === "personas" ? <><Spinner /> Composing</> : "Compose personas"}</button>
                </div>
                <p style={{ margin: "0 0 10px", fontSize: 12, color: "#9a9aa0", lineHeight: 1.45 }}>Each persona is one outcome plus who they are plus one or two facets. No score, no ranking, delete what does not land.</p>
                {segmentMap.personas.length > 0 && (
                  <div>
                    {activePersona && (
                      <div style={{ fontSize: 12, color: "#1B7A43", fontWeight: 700, marginBottom: 8 }}>Targeting {activePersona.name} for generation below. <span style={{ cursor: "pointer", textDecoration: "underline", fontWeight: 700 }} onClick={() => setActivePersonaId(null)}>Clear</span></div>
                    )}
                    {segmentMap.personas.map((p) => {
                      const isActive = p.id === activePersonaId;
                      return (
                        <div key={p.id} style={{ border: isActive ? "2px solid #1B7A43" : "1px solid #ececef", borderRadius: 10, padding: 10, marginBottom: 8, background: isActive ? "#f3faf5" : "#fff" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                            <span style={{ fontWeight: 800, fontSize: 13.5 }}>{p.name}</span>
                            <span onClick={() => removePersona(p.id)} style={{ cursor: "pointer", color: "#9a9aa0", fontWeight: 700 }}>×</span>
                          </div>
                          <div style={{ fontSize: 12.5, color: "#3a3a3e", lineHeight: 1.45, marginBottom: 6 }}>{p.description}</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8 }}>
                            <Chip text={p.outcomeName} color={BLOCKS.Promise.color} />
                            {Object.entries(p.demographics).map(([groupId, val]) => (
                              <Chip key={groupId} text={val} color={BLOCKS.Constraints.color} />
                            ))}
                            {p.facets.map((f, i) => (
                              <Chip key={i} text={f.value} color={BLOCKS.Curiosity.color} />
                            ))}
                          </div>
                          <button style={{ ...btnGhost, padding: "5px 10px", fontSize: 11.5, ...(isActive ? { background: "#1B7A43", border: "1px solid #1B7A43", color: "#fff" } : {}) }} onClick={() => setActivePersonaId(isActive ? null : p.id)}>{isActive ? "Targeting this persona" : "Generate for this persona"}</button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>

            <div style={{ display: "flex", gap: 6, background: "#ececef", padding: 4, borderRadius: 10 }}>
              {[["guided", "Guided"], ["expert", "Expert"]].map(([v, t]) => (
                <button key={v} onClick={() => setMode(v)} style={{ flex: 1, fontFamily: "inherit", fontWeight: 700, fontSize: 13, padding: "8px", borderRadius: 7, cursor: "pointer", border: "none", background: mode === v ? "#fff" : "transparent", color: mode === v ? "#141414" : "#6b6b70", boxShadow: mode === v ? "0 1px 2px rgba(0,0,0,.08)" : "none" }}>{t}</button>
              ))}
            </div>

            <section style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>{step(1)}Tell us about it</h2>
                <select defaultValue="" onChange={(e) => { loadPreset(e.target.value); e.target.value = ""; }} style={{ ...btnGhost, padding: "5px 9px", fontSize: 12, cursor: "pointer" }}>
                  <option value="" disabled>Load a starter…</option>
                  {Object.keys(PRESETS).map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>
              {mode === "guided" ? (
                <>
                  {intakeFields.map((f) => {
                    const fromStep0 = f.k === "offer" && chosenOffer;
                    const q = fromStep0 ? "Offer for this ad" : f.q;
                    const ph = fromStep0 ? "Your selected front-door offer. Edit the wording if you like." : f.ph;
                    return (
                      <div key={f.k} style={{ marginBottom: 12 }}>
                        <label style={label}>{q}{f.req && <span style={{ color: "#E8242B" }}> *</span>}</label>
                        {fromStep0 && <div style={{ fontSize: 11, color: "#1B7A43", fontWeight: 700, marginBottom: 5 }}>Loaded from Step 0 · editable</div>}
                        <textarea style={{ ...field, minHeight: f.min, borderColor: fromStep0 ? "#1B7A43" : "#e2e2e6" }} value={intake[f.k]} onChange={(e) => setIn(f.k, e.target.value)} placeholder={ph} />
                      </div>
                    );
                  })}
                  <div style={{ marginTop: 6, marginBottom: 12, borderTop: "1px solid #f0f0f2", paddingTop: 14 }}>
                    <label style={{ ...label, color: "#141414" }}>Paste real market language</label>
                    <p style={{ margin: "0 0 8px", fontSize: 12, color: "#6b6b70", lineHeight: 1.5 }}>Optional, but this is what makes the avatar sharp. Reviews, Reddit or forum posts, comments, call or DM snippets.</p>
                    <textarea style={{ ...field, minHeight: 100, fontFamily: "ui-monospace, Menlo, Consolas, monospace", fontSize: 12.5 }} value={intake.corpus} onChange={(e) => setIn("corpus", e.target.value)} placeholder={`"I've spent thousands and still have nothing to show for it."\n"I'm just not a tech person."`} />
                    <div style={{ fontSize: 11, color: corpusTrimmed ? "#7A0E12" : "#9a9aa0", marginTop: 4 }}>{intake.corpus.length.toLocaleString()} characters{corpusTrimmed ? ` · only the first ${CORPUS_CAP.toLocaleString()} read` : ""}</div>
                  </div>
                  <button style={btnState("avatar", { ...btn, justifyContent: "center", width: "100%", padding: 12 })} onClick={buildAvatar} disabled={busy === "avatar"}>{busy === "avatar" ? <><Spinner /> {avatarStage === "research" ? "Researching the market" : "Building your buyer"}</> : (hasCorpus ? "Run research pass + build avatar" : "Build my buyer avatar")}</button>
                </>
              ) : (
                <>
                  <label style={label}>Offer for this ad<span style={{ color: "#E8242B" }}> *</span></label>
                  <textarea style={{ ...field, minHeight: 70 }} value={intake.offer} onChange={(e) => setIn("offer", e.target.value)} placeholder="What this ad promotes. Your front-door offer if you have one, otherwise what you sell." />
                  <div style={{ height: 10 }} />
                  <label style={label}>Market / avatar</label>
                  <textarea style={{ ...field, minHeight: 48 }} value={intake.audience} onChange={(e) => setIn("audience", e.target.value)} placeholder="Who is this for?" />
                  <div style={{ height: 12 }} />
                  <button style={btnState("blocks", { ...btnGhost, width: "100%", justifyContent: "center" })} onClick={draftBlocksExpert} disabled={busy === "blocks"}>{busy === "blocks" ? <><Spinner /> Drafting blocks</> : "Draft the six blocks"}</button>
                </>
              )}

              {/* campaign settings */}
              <div style={{ height: 14 }} />
              <div style={{ borderTop: "1px solid #f0f0f2", paddingTop: 14 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div><label style={label}>Brand name</label><input style={field} value={intake.brandName} onChange={(e) => setIn("brandName", e.target.value)} placeholder="Your Brand" /></div>
                  <div><label style={label}>Website</label><input style={field} value={intake.domain} onChange={(e) => setIn("domain", e.target.value)} placeholder="yourbrand.com" /></div>
                </div>
                <div style={{ height: 10 }} />
                <div style={{ marginBottom: 10 }}><label style={label}>Brand voice</label><select style={field} value={intake.voice} onChange={(e) => setIn("voice", e.target.value)}>{Object.keys(VERTICAL_LANGUAGE_PROFILES).map((v) => <option key={v} value={v}>{v} · {VERTICAL_LANGUAGE_PROFILES[v].tag}</option>)}</select></div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div><label style={label}>Objective</label><select style={field} value={intake.objective} onChange={(e) => setIn("objective", e.target.value)}>{OBJECTIVES.map((o) => <option key={o}>{o}</option>)}</select></div>
                  <div><label style={label}>Placement</label><select style={field} value={platform} onChange={(e) => setPlatform(e.target.value)}>{PLATFORMS.map((p) => <option key={p}>{p}</option>)}</select></div>
                </div>
                {isLeadGen && (
                  <div style={{ marginTop: 10 }}>
                    <label style={label}>Lead offer (the free next step)</label>
                    <input style={field} value={intake.leadOffer} onChange={(e) => setIn("leadOffer", e.target.value)} placeholder="Free roof inspection / Free implant consult" />
                    <div style={{ fontSize: 11, color: "#9a9aa0", marginTop: 4 }}>The CTA sells this, not the purchase.</div>
                  </div>
                )}
                <div style={{ marginTop: 10 }}>
                  <label style={label}>Awareness stage, optional</label>
                  <select style={field} value={intake.awareness} onChange={(e) => setIn("awareness", e.target.value)}>
                    <option value="">Not set, generate as before</option>
                    {AWARENESS_STAGES.map((s) => <option key={s.id} value={s.id}>{s.label} · {s.desc}</option>)}
                  </select>
                  <div style={{ fontSize: 11, color: "#9a9aa0", marginTop: 4 }}>Changes which block leads and how direct the call to action is. Colder stages hold the offer back, warmer stages lead with it.</div>
                </div>
                <div style={{ marginTop: 12, padding: "10px 12px", background: "#fbfbfc", border: "1px solid #ececef", borderRadius: 8 }}>
                  <label style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer", fontSize: 13, color: "#1c1e21" }}>
                    <input type="checkbox" checked={!!intake.regulated} onChange={(e) => setIn("regulated", e.target.checked)} style={{ marginTop: 2 }} />
                    <span>Regulated vertical (health, medical, legal, financial, or income claims)</span>
                  </label>
                  {intake.regulated && (
                    <div style={{ marginTop: 8 }}>
                      <label style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer", fontSize: 12.5, color: "#1c1e21" }}>
                        <input type="checkbox" checked={complianceAck} onChange={(e) => setComplianceAck(e.target.checked)} style={{ marginTop: 2 }} />
                        <span>I will have a human review every claim against platform policy and the relevant board or regulator before any spend. Anvil holds claims to the substantiable and sells the free next step.</span>
                      </label>
                      {!complianceAck && <div style={{ fontSize: 11, color: "#B26B00", marginTop: 6 }}>Generation is paused until this is acknowledged.</div>}
                    </div>
                  )}
                </div>
              </div>
            </section>

            {mode === "guided" && avatar && (
              <section ref={avatarRef} style={card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>{step(2)}Your buyer</h2>
                  <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".04em", color: conf.c, background: conf.bg, borderRadius: 999, padding: "3px 9px" }}>{conf.t}</span>
                </div>
                {avatar.coverage && <p style={{ margin: "2px 0 14px", fontSize: 12, color: "#6b6b70", fontStyle: "italic" }}>{avatar.coverage}</p>}
                {Array.isArray(avatar.pains) && avatar.pains.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={miniH(BLOCKS.Pain.color)}>Pains, ranked</div>
                    {avatar.pains.map((p, i) => {
                      const obj = typeof p === "string" ? { text: p } : p;
                      return (
                        <div key={i} style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 13, lineHeight: 1.45, color: "#1f1f22" }}>{obj.text}</div>
                          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 3 }}>
                            {obj.frequency && <Chip text={obj.frequency + " freq"} color={FREQ[obj.frequency] || "#9a9aa0"} />}
                            {obj.type && <Chip text={obj.type} color="#6b6b70" />}
                          </div>
                          {obj.quote ? <div style={{ fontSize: 12.5, color: BLOCKS.Pain.ink, fontStyle: "italic", marginTop: 3, paddingLeft: 8, borderLeft: `2px solid ${BLOCKS.Pain.color}` }}>“{stripQuoteMarks(obj.quote)}”</div> : null}
                        </div>
                      );
                    })}
                  </div>
                )}
                <AvCol title="How it shows up around them" items={avatar.relationalImpact} color={BLOCKS.Pain.color} />
                <AvLine title="The dream" text={avatar.desire} color={BLOCKS.Promise.color} />
                <AvCol title="If it were fully solved" items={avatar.dreamOutcomes} color={BLOCKS.Promise.color} />
                <AvLine title="Core wound" text={avatar.coreWound} color={BLOCKS.Pain.ink} />
                <AvCol title="Deep fears" items={avatar.fears} color={BLOCKS.Pain.ink} />
                <AvLine title="Who or what they blame" text={avatar.villain} color={BLOCKS.Pain.ink} />
                <AvCol title="Blocking beliefs" items={avatar.beliefs} color={BLOCKS.Constraints.color} />
                <AvCol title="Objections, in their words" items={avatar.objections} color={BLOCKS.Constraints.ink} />
                {Array.isArray(avatar.triedBefore) && avatar.triedBefore.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={miniH(BLOCKS.Curiosity.ink)}>Tried before, and why it failed</div>
                    {avatar.triedBefore.map((t, i) => {
                      const o = typeof t === "string" ? { tried: t } : t;
                      return <div key={i} style={{ fontSize: 13, lineHeight: 1.45, color: "#1f1f22", marginBottom: 3 }}><strong>{o.tried}</strong>{o.whyFailed ? ": " + o.whyFailed : ""}</div>;
                    })}
                  </div>
                )}
                <AvCol title="What they refuse to do" items={avatar.wontDo} color={BLOCKS.Constraints.color} />
                <AvLine title="What solving it costs them" text={avatar.secondaryGain} color={BLOCKS.Constraints.ink} />
                {avatar.constraints && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={miniH(BLOCKS.Constraints.color)}>The 3 big constraints</div>
                    {Object.entries(avatar.constraints).map(([k, v]) => <div key={k} style={{ fontSize: 13, lineHeight: 1.5, color: "#1f1f22" }}><strong>{k}:</strong> {v}</div>)}
                  </div>
                )}
                {Array.isArray(avatar.marketAngles) && avatar.marketAngles.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={miniH(BLOCKS.Curiosity.ink)}>Angles already running</div>
                    {avatar.marketAngles.map((a, i) => {
                      const obj = typeof a === "string" ? { angle: a } : a;
                      const sc = obj.saturation === "high" ? "#E8242B" : obj.saturation === "medium" ? "#9a7a0c" : "#1B7A43";
                      return (<div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", marginBottom: 3 }}><span style={{ fontSize: 13, color: "#1f1f22" }}>{obj.angle}</span>{obj.saturation && <Chip text={obj.saturation} color={sc} />}</div>);
                    })}
                    <div style={{ fontSize: 11, color: "#9a9aa0", marginTop: 3 }}>The engine steers Curiosity away from the saturated ones.</div>
                  </div>
                )}
                <AvCol title="Proof the market trusts (you have)" items={avatar.proofTrusted} color={BLOCKS.Proof.color} />
                {Array.isArray(avatar.proofGaps) && avatar.proofGaps.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={miniH("#7A0E12")}>Proof gaps to fill</div>
                    <ul style={{ margin: 0, paddingLeft: 16, fontSize: 13, lineHeight: 1.5, color: "#7A0E12" }}>{avatar.proofGaps.map((x, i) => <li key={i}>{x}</li>)}</ul>
                  </div>
                )}
                <AvCol title="Voice of customer" items={avatar.voice} color={BLOCKS.Curiosity.ink} />
                <button style={btnState("blocks", { ...btn, justifyContent: "center", width: "100%", padding: 12, marginTop: 4 })} onClick={buildBlocks} disabled={busy === "blocks"}>{busy === "blocks" ? <><Spinner /> Deriving the six blocks</> : "Build my blocks from this"}</button>
              </section>
            )}

            <section style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>{step(3)}The blocks</h2>
                {(avatar || activePersona) && (
                  <button style={btnState("blocks", { ...btnGhost, padding: "6px 10px", fontSize: 12 })} onClick={buildBlocks} disabled={busy === "blocks"}>{busy === "blocks" ? <><Spinner /> Deriving</> : activePersona ? `Build for ${activePersona.name}` : "Build my blocks from this"}</button>
                )}
              </div>
              <p style={{ margin: "0 0 14px", fontSize: 12.5, color: "#6b6b70" }}>Pre-filled and editable. Each block names the framework it came from.{activePersona ? " Targeting " + activePersona.name + ", re-run this after switching personas so the blocks actually change." : ""}</p>
              {BLOCK_NAMES.map((n) => (
                <div key={n} style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <label style={{ ...label, marginBottom: 4, color: BLOCKS[n].ink }}><Dot name={n} />{n}</label>
                    <span style={{ fontSize: 10, color: BLOCKS[n].color, fontWeight: 700 }}>{BLOCKS[n].method}</span>
                  </div>
                  <textarea style={{ ...field, minHeight: 46, borderColor: blocks[n] ? BLOCKS[n].color : "#e2e2e6" }} value={blocks[n]} onChange={(e) => setBlock(n, e.target.value)} placeholder={BLOCKS[n].desc} />
                  {notes[n] && <div style={{ fontSize: 11.5, color: "#9a9aa0", marginTop: 3, fontStyle: "italic" }}>{notes[n]}</div>}
                </div>
              ))}
            </section>

            <section style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Proof pairing</h2>
                <button style={btnState("proof", { ...btnGhost, padding: "6px 10px", fontSize: 12 })} onClick={buildProofPairing} disabled={busy === "proof"}>{busy === "proof" ? <><Spinner /> Matching proof</> : "Suggest proof pairing"}</button>
              </div>
              <p style={{ margin: "0 0 12px", fontSize: 12.5, color: "#6b6b70" }}>Matches proof you actually have to the specific claims you are making. Bigger claims get pushed toward harder-to-fake proof when you have it. Never invents evidence.</p>
              {proofPairing.length > 0 && proofPairing.map((p, i) => {
                const type = PROOF_TYPES.find((t) => t.id === p.proofTypeId);
                return (
                  <div key={i} style={{ borderTop: i > 0 ? "1px solid #f0f0f2" : "none", paddingTop: i > 0 ? 10 : 0, marginTop: i > 0 ? 10 : 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#1c1e21", marginBottom: 3 }}>{p.claim}</div>
                    {type && <div style={{ marginBottom: 4 }}><Chip text={`${type.category} · ${type.strength}/5${type.underused ? " · underused" : ""}`} color={BLOCKS.Proof.color} /> <span style={{ fontSize: 12, color: "#6b6b70" }}>{type.name}</span></div>}
                    {p.gap ? (
                      <div style={{ fontSize: 12.5, color: "#7A0E12", fontStyle: "italic" }}>No real proof on hand for this claim yet. Worth softening the claim or getting the proof before spending on it.</div>
                    ) : (
                      <>
                        <div style={{ fontSize: 13, color: "#1f1f22", marginBottom: 6 }}>{p.proofText}</div>
                        <button style={{ ...btnGhost, padding: "5px 10px", fontSize: 12 }} onClick={() => setBlock("Proof", p.proofText)}>Use in Proof block</button>
                      </>
                    )}
                  </div>
                );
              })}
            </section>

            <section style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Constraints dissolve</h2>
                <button style={btnState("constraints", { ...btnGhost, padding: "6px 10px", fontSize: 12 })} onClick={buildConstraintsDissolve} disabled={busy === "constraints"}>{busy === "constraints" ? <><Spinner /> Working it</> : "Dissolve an objection"}</button>
              </div>
              <p style={{ margin: "0 0 12px", fontSize: 12.5, color: "#6b6b70" }}>Classifies real objections and beliefs, then either dissolves them or side-steps them. Value and identity objections are never argued with, only reframed.</p>
              {constraintDissolve.length > 0 && constraintDissolve.map((c, i) => {
                const isSidestep = c.strategy === "sidestep" || c.level === "Value" || c.level === "Identity";
                const combined = isSidestep ? c.sidestep : [c.acknowledge, c.wedge, c.elaborate].filter(Boolean).join(" ");
                return (
                  <div key={i} style={{ borderTop: i > 0 ? "1px solid #f0f0f2" : "none", paddingTop: i > 0 ? 10 : 0, marginTop: i > 0 ? 10 : 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#1c1e21", marginBottom: 3 }}>{c.objection}</div>
                    <div style={{ marginBottom: 4 }}><Chip text={`${c.level} · ${isSidestep ? "side-step" : "dissolve"}`} color={BLOCKS.Constraints.color} /></div>
                    {isSidestep ? (
                      <div style={{ fontSize: 13, color: "#1f1f22", marginBottom: 6 }}>{c.sidestep}</div>
                    ) : (
                      <div style={{ fontSize: 13, color: "#1f1f22", marginBottom: 6, lineHeight: 1.5 }}>
                        <div><span style={{ fontWeight: 700 }}>Acknowledge: </span>{c.acknowledge}</div>
                        <div><span style={{ fontWeight: 700 }}>Wedge: </span>{c.wedge}</div>
                        <div><span style={{ fontWeight: 700 }}>Elaborate: </span>{c.elaborate}</div>
                      </div>
                    )}
                    <button style={{ ...btnGhost, padding: "5px 10px", fontSize: 12 }} onClick={() => setBlock("Constraints", combined)}>Use in Constraints block</button>
                  </div>
                );
              })}
            </section>

            <section style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Curiosity angles</h2>
                <button style={btnState("curiosity", { ...btnGhost, padding: "6px 10px", fontSize: 12 })} onClick={buildCuriosityAngles} disabled={busy === "curiosity"}>{busy === "curiosity" ? <><Spinner /> Finding the gap</> : "Find curiosity angles"}</button>
              </div>
              <p style={{ margin: "0 0 12px", fontSize: 12.5, color: "#6b6b70" }}>Curiosity is the gap between what the market already believes and what you actually see. The last two angles below are the ones worth using, the first two are the saturated take, shown so you can see the gap.</p>
              {curiosityAngles.length > 0 && curiosityAngles.map((a, i) => {
                const q = CURIOSITY_QUADRANTS.find((x) => x.id === a.quadrantId);
                const isYours = a.quadrantId === "your_problem" || a.quadrantId === "your_solution";
                return (
                  <div key={i} style={{ borderTop: i > 0 ? "1px solid #f0f0f2" : "none", paddingTop: i > 0 ? 10 : 0, marginTop: i > 0 ? 10 : 0 }}>
                    <div style={{ marginBottom: 4 }}><Chip text={q ? q.label : a.quadrantId} color={BLOCKS.Curiosity.color} /></div>
                    <div style={{ fontSize: 13, color: "#1f1f22", marginBottom: 6 }}>{a.angle}</div>
                    {isYours && <button style={{ ...btnGhost, padding: "5px 10px", fontSize: 12 }} onClick={() => applyCuriosityAngle(a.angle, "curiosity-grid", a.quadrantId)}>Use in Curiosity block</button>}
                  </div>
                );
              })}
              {characterizations.length > 0 && (
                <div style={{ marginTop: 14, borderTop: "1px solid #f0f0f2", paddingTop: 12 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: "#3a3a3e", marginBottom: 6 }}>Naming a mechanism</div>
                  {characterizations.map((c, i) => (
                    <div key={i} style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#1c1e21" }}>{c.name}</div>
                      <div style={{ fontSize: 12.5, color: "#6b6b70" }}>{c.description}</div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Angle multiplication</h2>
                <button style={btnState("angles", { ...btnGhost, padding: "6px 10px", fontSize: 12 })} onClick={buildAngleMultiplication} disabled={busy === "angles"}>{busy === "angles" ? <><Spinner /> Multiplying</> : "Multiply into angles"}</button>
              </div>
              <p style={{ margin: "0 0 12px", fontSize: 12.5, color: "#6b6b70" }}>One fact, wrapped in different angles, is many psychological entry points. {activePersona ? `Reading from ${activePersona.name}.` : "Pick a persona above to target one specific buyer, or this reads from the avatar or Pain and Promise blocks instead."} Anvil widens the field, you pick what lands, nothing here is ranked or declared a winner.</p>
              {angleMultiplication.length > 0 && angleMultiplication.map((a, i) => {
                const fam = ANGLE_FAMILIES.find((f) => f.id === a.familyId);
                return (
                  <div key={i} style={{ borderTop: i > 0 ? "1px solid #f0f0f2" : "none", paddingTop: i > 0 ? 10 : 0, marginTop: i > 0 ? 10 : 0 }}>
                    <div style={{ marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
                      <Chip text={fam ? fam.label : a.familyId} color={BLOCKS.Curiosity.color} />
                      <span style={{ fontSize: 11.5, color: "#9a9aa0" }}>{a.subtype}</span>
                      {fam && fam.safeForTrust && <span style={{ fontSize: 10.5, fontWeight: 700, color: "#1B7A43", border: "1px solid #1B7A43", borderRadius: 6, padding: "1px 6px" }}>safe for trust markets</span>}
                    </div>
                    <div style={{ fontSize: 13, color: "#1f1f22", marginBottom: 6 }}>{a.angle}</div>
                    <button style={{ ...btnGhost, padding: "5px 10px", fontSize: 12 }} onClick={() => applyCuriosityAngle(a.angle, a.familyId, a.subtype)}>Use in Curiosity block</button>
                  </div>
                );
              })}
            </section>

            <section style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Naming and metaphor</h2>
                <button style={btnState("naming", { ...btnGhost, padding: "6px 10px", fontSize: 12 })} onClick={buildNamingAndMetaphor} disabled={busy === "naming"}>{busy === "naming" ? <><Spinner /> Naming it</> : "Find names and metaphors"}</button>
              </div>
              <p style={{ margin: "0 0 12px", fontSize: 12.5, color: "#6b6b70" }}>Metaphors that make the mechanism concrete, names at three levels of how much they reveal, and names that answer a real objection on their own.</p>
              {intuitionPumps.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: "#3a3a3e", marginBottom: 6 }}>Metaphors</div>
                  {intuitionPumps.map((m, i) => (
                    <div key={i} style={{ marginBottom: 8 }}>
                      <Chip text={m.type} color={BLOCKS.Curiosity.color} />
                      <div style={{ fontSize: 13, color: "#1f1f22", marginTop: 3 }}>{m.metaphor}</div>
                    </div>
                  ))}
                </div>
              )}
              {evocativeNames.length > 0 && (
                <div style={{ marginBottom: 14, borderTop: "1px solid #f0f0f2", paddingTop: 12 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: "#3a3a3e", marginBottom: 6 }}>Names, by how much they reveal</div>
                  {evocativeNames.map((n, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <div><Chip text={n.level} color={BLOCKS.Curiosity.color} /> <span style={{ fontSize: 13, fontWeight: 700, color: "#1c1e21", marginLeft: 6 }}>{n.name}</span></div>
                      <button style={{ ...btnGhost, padding: "4px 9px", fontSize: 11.5 }} onClick={() => { try { navigator.clipboard.writeText(n.name); } catch (e) {} }}>Copy</button>
                    </div>
                  ))}
                </div>
              )}
              {antiConstraintNames.length > 0 && (
                <div style={{ borderTop: "1px solid #f0f0f2", paddingTop: 12 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: "#3a3a3e", marginBottom: 6 }}>Names that answer an objection</div>
                  {antiConstraintNames.map((n, i) => (
                    <div key={i} style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 11.5, color: "#9a9aa0", fontStyle: "italic", marginBottom: 2 }}>Answers: {n.objection}</div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#1c1e21" }}>{n.name}</span>
                        <button style={{ ...btnGhost, padding: "4px 9px", fontSize: 11.5 }} onClick={() => { try { navigator.clipboard.writeText(n.name); } catch (e) {} }}>Copy</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Pain chain and promise ladder</h2>
                <button style={btnState("ladder", { ...btnGhost, padding: "6px 10px", fontSize: 12 })} onClick={buildPainPromiseLadder} disabled={busy === "ladder"}>{busy === "ladder" ? <><Spinner /> Building</> : "Build the chain and ladder"}</button>
              </div>
              <p style={{ margin: "0 0 12px", fontSize: 12.5, color: "#6b6b70" }}>Each moves from the general complaint or desire down to the specific, felt reality underneath it, in 4 matching rungs.</p>
              {painChain.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: BLOCKS.Pain.ink, marginBottom: 6 }}>Pain chain</div>
                  {painChain.map((p, i) => {
                    const rung = LADDER_RUNGS.find((r) => r.id === p.rung);
                    return (
                      <div key={i} style={{ marginBottom: 6 }}>
                        <Chip text={rung ? rung.label : p.rung} color={BLOCKS.Pain.color} />
                        <div style={{ fontSize: 13, color: "#1f1f22", marginTop: 3 }}>{p.text}</div>
                      </div>
                    );
                  })}
                  <button style={{ ...btnGhost, padding: "5px 10px", fontSize: 12, marginTop: 4 }} onClick={() => setBlock("Pain", painChain.map((p) => p.text).join(" "))}>Use full chain in Pain block</button>
                </div>
              )}
              {promiseLadder.length > 0 && (
                <div style={{ borderTop: "1px solid #f0f0f2", paddingTop: 12 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: BLOCKS.Promise.ink, marginBottom: 6 }}>Promise ladder</div>
                  {promiseLadder.map((p, i) => {
                    const rung = LADDER_RUNGS.find((r) => r.id === p.rung);
                    return (
                      <div key={i} style={{ marginBottom: 6 }}>
                        <Chip text={rung ? rung.label : p.rung} color={BLOCKS.Promise.color} />
                        <div style={{ fontSize: 13, color: "#1f1f22", marginTop: 3 }}>{p.text}</div>
                      </div>
                    );
                  })}
                  <button style={{ ...btnGhost, padding: "5px 10px", fontSize: 12, marginTop: 4 }} onClick={() => setBlock("Promise", promiseLadder.map((p) => p.text).join(" "))}>Use full ladder in Promise block</button>
                </div>
              )}
            </section>

            <section style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Conditions</h2>
                <button style={btnState("conditions", { ...btnGhost, padding: "6px 10px", fontSize: 12 })} onClick={buildConditions} disabled={busy === "conditions"}>{busy === "conditions" ? <><Spinner /> Wrapping the offer</> : "Build the 5 conditions"}</button>
              </div>
              <p style={{ margin: "0 0 12px", fontSize: 12.5, color: "#6b6b70" }}>Qualifications, conversion triggers, risk reversal, value adds, and terms. Only ever uses real facts on hand, and flags a question instead of inventing a deadline or a guarantee.</p>
              {conditionsResult.length > 0 && conditionsResult.map((c, i) => {
                const type = CONDITIONS_TYPES.find((t) => t.id === c.typeId);
                return (
                  <div key={i} style={{ borderTop: i > 0 ? "1px solid #f0f0f2" : "none", paddingTop: i > 0 ? 10 : 0, marginTop: i > 0 ? 10 : 0 }}>
                    <div style={{ marginBottom: 4 }}><Chip text={type ? type.name : c.typeId} color={BLOCKS.Conditions.color} /></div>
                    {c.gap ? (
                      <div style={{ fontSize: 12.5, color: "#7A0E12", fontStyle: "italic" }}>{c.askFor || "Nothing on hand supports this type yet."}</div>
                    ) : (
                      <>
                        <div style={{ fontSize: 13, color: "#1f1f22", marginBottom: 6 }}>{c.text}</div>
                        <button style={{ ...btnGhost, padding: "5px 10px", fontSize: 12 }} onClick={() => setBlock("Conditions", [blocks.Conditions, c.text].filter(Boolean).join(" "))}>Add to Conditions block</button>
                      </>
                    )}
                  </div>
                );
              })}
            </section>

            <section style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>{step(4)}The template</h2>
                <button style={btnState("recommend", { ...btnGhost, padding: "6px 10px", fontSize: 12 })} onClick={recommendTemplate} disabled={busy === "recommend"}>{busy === "recommend" ? <><Spinner /> Matching</> : "Recommend"}</button>
              </div>
              <select style={field} value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                <option value="auto">Auto-recommend{recommended ? `: ${TEMPLATES.find((t) => t.id === recommended.id)?.name}` : ""}</option>
                {TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.id}. {t.name}</option>)}
              </select>
              {recommended && templateId === "auto" && <p style={{ margin: "10px 0 0", fontSize: 12.5, color: "#1B79B5", fontStyle: "italic" }}>{recommended.reason}</p>}
              {activeTemplate && (
                <div style={{ marginTop: 12, fontSize: 12.5, color: "#3a3a3e", lineHeight: 1.6, borderTop: "1px solid #f0f0f2", paddingTop: 12 }}>
                  <div style={{ marginBottom: 6, color: "#6b6b70" }}>{activeTemplate.when}</div>
                  <div><strong>Open</strong> · {activeTemplate.opening}</div>
                  <div><strong>Middle</strong> · {activeTemplate.middle}</div>
                  <div><strong>Close</strong> · {activeTemplate.close}</div>
                </div>
              )}
              {isSearch && <div style={{ marginTop: 12, fontSize: 12, color: "#9a9aa0", lineHeight: 1.5 }}>Google Search builds an asset set, not a single ad. The template still steers the angle behind the headlines.</div>}
            </section>

            <button style={btnState("generate", { ...btn, justifyContent: "center", padding: 14, fontSize: 15 })} onClick={generateAd} disabled={busy === "generate"}>{busy === "generate" ? <><Spinner /> {isSearch ? "Writing search ads" : "Generating the ad"}</> : (isSearch ? "Generate search ad assets" : `Generate one ${platform} ad`)}</button>

            {/* A/B test lab */}
            <section style={{ ...card, padding: 16 }}>
              <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800 }}>A/B test lab</h2>
              {isSearch ? (
                <p style={{ margin: 0, fontSize: 12.5, color: "#6b6b70", lineHeight: 1.5 }}>Google rotates the 15 headlines and 4 descriptions automatically, so the asset set is the test. Switch to a feed or video placement to use the A/B lab.</p>
              ) : (
                <>
                  <p style={{ margin: "0 0 12px", fontSize: 12.5, color: "#6b6b70" }}>One variable changes, everything else stays fixed. That is how you learn what actually moved the number.</p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 92px", gap: 8, marginBottom: 10 }}>
                    <div><label style={label}>Test variable</label><select style={field} value={testAxis} onChange={(e) => setTestAxis(e.target.value)}>{AXES.map((a) => <option key={a}>{a}</option>)}</select></div>
                    <div><label style={label}>Variants</label><select style={field} value={testCount} onChange={(e) => setTestCount(Number(e.target.value))}>{[2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}</select></div>
                  </div>
                  <button style={btnState("test", { ...btn, justifyContent: "center", width: "100%", padding: 12 })} onClick={generateTestSet} disabled={busy === "test"}>{busy === "test" ? <><Spinner /> Building {testCount} variants</> : "Generate A/B test set"}</button>
                </>
              )}
            </section>

            {error && <div style={{ background: "#FBE4E5", border: "1px solid #f3b5b8", color: "#7A0E12", padding: "10px 12px", borderRadius: 8, fontSize: 13 }}>{error}</div>}

            <button style={{ ...btnGhost, justifyContent: "center", borderStyle: "dashed", color: "#6b6b70", borderColor: "#d4d4d8" }} onClick={() => setShowRef((s) => !s)}>{showRef ? "Hide" : "Show"} framework reference</button>
            {showRef && (
              <section style={{ ...card, fontSize: 12.5, lineHeight: 1.6, color: "#3a3a3e" }}>
                <h3 style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 800 }}>Voice</h3>
                <div style={{ marginBottom: 8 }}>Plain and credible is the default for local businesses and trust markets. It bans hype, fake urgency, and unprovable claims, and keeps Curiosity at a believable level. Ambitious and direct fits the operator audience without the guru act. Raw direct-response is the original style, for supplements and info only.</div>
                <h3 style={{ margin: "8px 0 6px", fontSize: 13, fontWeight: 800 }}>Objective</h3>
                <div style={{ marginBottom: 8 }}>Lead generation sells the free next step, the consult or inspection, not the purchase. The CTA and Conditions block follow. Direct sale drives the buy.</div>
                <h3 style={{ margin: "8px 0 6px", fontSize: 13, fontWeight: 800 }}>Testing discipline</h3>
                <div style={{ marginBottom: 8 }}>Change one variable per test. Give each variant enough budget and time to reach significance. Kill losers, scale the winner, then run the next test. Test hooks and creative first.</div>
                <h3 style={{ margin: "8px 0 6px", fontSize: 13, fontWeight: 800 }}>The six blocks</h3>
                {BLOCK_NAMES.map((n) => <div key={n} style={{ marginBottom: 5 }}><Dot name={n} /><strong style={{ color: BLOCKS[n].ink }}>{n}</strong> · {BLOCKS[n].desc} <span style={{ color: BLOCKS[n].color }}>({BLOCKS[n].method})</span></div>)}
              </section>
            )}
          </div>

          {/* RIGHT */}
          <div ref={resultsRef}>
            {results.length === 0 && (
              <div style={{ ...card, padding: 40, textAlign: "center", color: "#9a9aa0", border: "1px dashed #d4d4d8" }}>
                <div style={{ display: "flex", gap: 5, justifyContent: "center", marginBottom: 14 }}>{BLOCK_NAMES.map((n) => <span key={n} style={{ width: 30, height: 30, borderRadius: 6, background: BLOCKS[n].tint, border: `2px solid ${BLOCKS[n].color}` }} />)}</div>
                <div style={{ fontWeight: 700, color: "#3a3a3e", marginBottom: 4 }}>Ads, test sets, and search assets appear here</div>
                <div style={{ fontSize: 13 }}>Tuned to your objective and shaped to the placement.</div>
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {results.map((r) => r.kind === "test" ? <TestSetView key={r.id} t={r} /> : r.kind === "rsa" ? <RsaCard key={r.id} r={r} /> : <AdPreview key={r.id} r={r} />)}
            </div>

            {results.length > 0 && (() => {
              const latestAd = results.find((r) => r.kind === "ad");
              const extraLp = latestAd && latestAd.cta ? { id: "lp_cta", text: `Your last ad's CTA was "${latestAd.cta}." The landing page button should say the same thing, not something close.` } : null;
              const extraSt = isLeadGen && intake.leadOffer.trim() ? { id: "st_lead", text: `Your lead offer is "${intake.leadOffer.trim()}." Make sure the page and the follow-up actually deliver that, not something adjacent.` } : null;
              const lpItems = extraLp ? [...LEVER_CHECKLIST.landingPage, extraLp] : LEVER_CHECKLIST.landingPage;
              const stItems = extraSt ? [...LEVER_CHECKLIST.speedToLead, extraSt] : LEVER_CHECKLIST.speedToLead;
              const Row = (item) => (
                <label key={item.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 8, cursor: "pointer", fontSize: 13, color: checkedLevers.includes(item.id) ? "#9a9aa0" : "#1f1f22", textDecoration: checkedLevers.includes(item.id) ? "line-through" : "none", lineHeight: 1.4 }}>
                  <input type="checkbox" checked={checkedLevers.includes(item.id)} onChange={() => toggleLever(item.id)} style={{ marginTop: 3, flexShrink: 0 }} />
                  <span>{item.text}</span>
                </label>
              );
              return (
                <section style={{ ...card, marginTop: 18 }}>
                  <h2 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 800 }}>Before you spend on this</h2>
                  <p style={{ margin: "0 0 12px", fontSize: 12.5, color: "#6b6b70", lineHeight: 1.5 }}>Copy is the fast first part of the job. Offer, creative, audience, the landing page, and how fast a lead gets a response all matter more than the words above. Nothing here is generated, it is just the reminder.</p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 20 }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: "#9a9aa0", marginBottom: 8 }}>Landing page match</div>
                      {lpItems.map(Row)}
                    </div>
                    {isLeadGen && (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: "#9a9aa0", marginBottom: 8 }}>Speed to lead</div>
                        {stItems.map(Row)}
                      </div>
                    )}
                  </div>
                </section>
              );
            })()}
          </div>
        </div>
      </main>
    </div>
  );
}

/* ---------- Responsive Search Ad ---------- */
function RsaCard({ r }) {
  const copy = (t) => { try { navigator.clipboard.writeText(t); } catch (e) {} };
  const pathStr = (r.paths || []).filter(Boolean).slice(0, 2).join("/");
  const title = (r.headlines || []).slice(0, 3).join(" | ");
  const desc = (r.descriptions || []).slice(0, 2).join(" ");
  const lenRow = (text, max) => {
    const len = (text || "").length, over = len > max;
    return (
      <div key={text} style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline", padding: "6px 0", borderBottom: "1px solid #f4f4f5" }}>
        <span style={{ fontSize: 13.5, color: "#1f1f22", lineHeight: 1.4 }}>{text}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: over ? "#E8242B" : "#9a9aa0", whiteSpace: "nowrap" }}>{len}/{max}</span>
      </div>
    );
  };
  const sec = { fontSize: 11, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: "#6b6b70", margin: "16px 0 4px" };
  const ctl = { fontFamily: "inherit", fontSize: 12, fontWeight: 600, padding: "6px 10px", borderRadius: 7, border: "1px solid #d4d4d8", background: "#fff", color: "#141414", cursor: "pointer" };
  return (
    <article style={{ background: "#fff", border: "1px solid #ececef", borderRadius: 14, padding: 16 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "#9a9aa0" }}>Google Search · Responsive Search Ad{r.personaName ? " · " + r.personaName : ""}{r.awarenessLabel ? " · " + r.awarenessLabel : ""}</div>
        <div style={{ display: "flex", gap: 6 }}>
          <button style={ctl} onClick={() => copy((r.headlines || []).join("\n"))}>Copy headlines</button>
          <button style={ctl} onClick={() => copy((r.descriptions || []).join("\n"))}>Copy descriptions</button>
        </div>
      </div>
      <div style={{ fontSize: 12, color: "#8E3B8E", fontWeight: 700, marginBottom: 12 }}>{r.objective}</div>

      <div style={{ background: "#fff", border: "1px solid #ececef", borderRadius: 8, padding: 14, marginBottom: 4 }}>
        <div style={{ fontSize: 12, color: "#202124", marginBottom: 2 }}>Sponsored</div>
        <div style={{ fontSize: 13, color: "#202124" }}>{r.domain}{pathStr ? " › " + pathStr : ""}</div>
        <div style={{ fontSize: 19, color: "#1a0dab", lineHeight: 1.25, margin: "2px 0" }}>{title}</div>
        <div style={{ fontSize: 13.5, color: "#4d5156", lineHeight: 1.45 }}>{desc}</div>
      </div>
      <div style={{ fontSize: 11, color: "#9a9aa0", marginBottom: 8 }}>Google mixes and matches assets, so this is one of many combinations.</div>

      <div style={sec}>Headlines · {(r.headlines || []).length}/15 · {HL_MAX} char limit</div>
      <div>{(r.headlines || []).map((h) => lenRow(h, HL_MAX))}</div>
      <div style={sec}>Descriptions · {(r.descriptions || []).length}/4 · {DESC_MAX} char limit</div>
      <div>{(r.descriptions || []).map((d) => lenRow(d, DESC_MAX))}</div>
      {(r.paths || []).length > 0 && (<><div style={sec}>Display paths · {PATH_MAX} char limit</div><div>{r.paths.map((p) => lenRow(p, PATH_MAX))}</div></>)}

      <div style={{ fontSize: 11.5, color: "#9a9aa0", marginTop: 12, lineHeight: 1.5 }}>Paste these into the Responsive Search Ad builder. Aim for at least 8 to 10 headlines and 3 to 4 descriptions, pin sparingly, and let Google optimize the combinations.</div>
    </article>
  );
}

/* ---------- Test set ---------- */
function TestSetView({ t }) {
  const plan = { background: "#f6f6f7", borderRadius: 10, padding: "10px 12px" };
  const planH = { fontSize: 10, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: "#9a9aa0", marginBottom: 3 };
  return (
    <article style={{ background: "#fff", border: "1px solid #ececef", borderRadius: 14, padding: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "#8E3B8E", marginBottom: 4 }}>A/B test · {t.platform}{t.personaName ? " · " + t.personaName : ""}</div>
      <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-.01em", marginBottom: 12 }}>Testing the {String(t.variable).toLowerCase()} · {t.variants.length} variants</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, marginBottom: 14 }}>
        {t.hypothesis && <div style={plan}><div style={planH}>Hypothesis</div><div style={{ fontSize: 13, color: "#1f1f22", lineHeight: 1.45 }}>{t.hypothesis}</div></div>}
        {t.metric && <div style={plan}><div style={planH}>Watch first</div><div style={{ fontSize: 13, color: "#1f1f22", lineHeight: 1.45 }}>{t.metric}</div></div>}
        {t.nextTest && <div style={plan}><div style={planH}>Test next</div><div style={{ fontSize: 13, color: "#1f1f22", lineHeight: 1.45 }}>{t.nextTest}</div></div>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>{t.variants.map((v) => <AdPreview key={v.id} r={v} nested />)}</div>
      <div style={{ fontSize: 11.5, color: "#9a9aa0", marginTop: 12, lineHeight: 1.5 }}>Run these as separate ads in one ad set or A/B test, give each enough budget and time to reach significance, then keep the winner and test the next variable.</div>
    </article>
  );
}

/* ---------- Ad preview ---------- */
function AdPreview({ r, nested }) {
  const [open, setOpen] = useState(false);
  const [showBlocks, setShowBlocks] = useState(false);
  const [anatomy, setAnatomy] = useState(false);
  const isFeed = isFeedPlatform(r.platform);
  const isLinkedIn = r.platform === "LinkedIn";
  const plainText = r.primaryText.map((s) => s.text).join(" ");
  const copy = (txt) => { try { navigator.clipboard.writeText(txt); } catch (e) {} };
  const exportRecord = toAdExportRecord(r);
  const allFields = `PLATFORM: ${r.platform}\nPERSONA: ${r.personaName || ""}\nAWARENESS: ${r.awarenessLabel || ""}\nANGLE FAMILY: ${r.angleFamily || ""}\nANGLE SUBTYPE: ${r.angleSubtype || ""}\nPRIMARY TEXT:\n${plainText}\n\nHEADLINE: ${r.headline}\nDESCRIPTION: ${r.description}\nCTA: ${r.cta}\nIMAGE: ${r.imageHeadline} / ${r.imageSubline}`;
  const ctl = { fontFamily: "inherit", fontSize: 12, fontWeight: 600, padding: "6px 10px", borderRadius: 7, border: "1px solid #d4d4d8", background: "#fff", color: "#141414", cursor: "pointer" };
  const Zone = ({ n, label }) => anatomy ? (
    <div style={{ padding: "8px 12px 2px", display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 10, fontWeight: 800, color: "#fff", background: "#141414", borderRadius: 999, minWidth: 16, height: 16, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>{n}</span>
      <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".05em", textTransform: "uppercase", color: "#65676b" }}>{label}</span>
    </div>
  ) : null;

  const body = () => {
    if (showBlocks) {
      return (
        <div style={{ padding: "0 12px 10px" }}>
          <div style={{ fontSize: 11.5, color: "#65676b", lineHeight: 1.5, margin: "2px 0 8px" }}>These selected blocks shape the primary text. Each segment should add a distinct idea, and the first segment is the awareness-appropriate hook.</div>
          {r.primaryText.map((s, i) => {
            const b = BLOCKS[s.block] || BLOCKS.Curiosity;
            return (
              <div key={i} style={{ background: b.tint, borderLeft: `4px solid ${b.color}`, padding: "8px 10px", margin: "6px 0" }}>
                <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", color: b.ink, marginBottom: 3 }}>{s.block}{i === 0 ? " · hook" : ""}</div>
                <div style={{ fontSize: 14, lineHeight: 1.45, color: "#1c1e21" }}>{s.text}</div>
              </div>
            );
          })}
          <div style={{ fontSize: 12, color: "#65676b", marginTop: 6 }}>{r.primaryText.length} blocks · {r.words} words · coverage {r.copyVelocity}. Coverage is a thinking aid, not a quality score.</div>
        </div>
      );
    }
    const mb = { color: "#65676b", fontWeight: 700, cursor: "pointer" };
    return (
      <div style={{ padding: "0 12px 10px", fontSize: 14, lineHeight: 1.45, color: "#1c1e21" }}>
        {open ? <span>{plainText} <span style={mb} onClick={() => setOpen(false)}>See less</span></span>
              : <span>{r.primaryText[0] && r.primaryText[0].text} <span style={mb} onClick={() => setOpen(true)}>… See more</span></span>}
      </div>
    );
  };

  return (
    <article style={{ background: "#fff", border: nested ? "1px solid #f0f0f2" : "1px solid #ececef", borderRadius: 14, padding: 14 }}>
      {r.label && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: "#fff", background: r.isControl ? "#5F6368" : "#141414", borderRadius: 999, padding: "3px 10px" }}>Variant {r.label}{r.isControl ? " · control" : ""}</span>
          {r.note && <span style={{ fontSize: 12.5, color: "#6b6b70" }}>{r.note}</span>}
        </div>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "#9a9aa0" }}>{r.platform}{r.template ? " · " + r.template.name : ""}{r.objective ? " · " + (r.objective === "Lead generation" ? "Lead gen" : "Sale") : ""}{r.personaName ? " · " + r.personaName : ""}{r.awarenessLabel ? " · " + r.awarenessLabel : ""}</div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <button style={ctl} onClick={() => setShowBlocks((s) => !s)}>{showBlocks ? "Hide" : "Show"} blocks</button>
          {isFeed && <button style={ctl} onClick={() => setAnatomy((s) => !s)}>{anatomy ? "Hide" : "Show"} anatomy</button>}
          <button style={ctl} onClick={() => copy(plainText)}>Copy text</button>
          <button style={ctl} onClick={() => copy(allFields)}>Copy all fields</button>
          <button style={ctl} onClick={() => copy(JSON.stringify(exportRecord, null, 2))}>Copy JSON</button>
          <div style={{ textAlign: "right", marginLeft: 4 }} title="Coverage is blocks per 100 words. A thinking aid, not a quality score.">
            <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1, color: "#9a9aa0" }}>{r.copyVelocity}</div>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "#9a9aa0" }}>Coverage</div>
          </div>
        </div>
      </div>

      {isFeed ? (
        <div style={{ background: "#eef0f2", borderRadius: 12, padding: 14, display: "flex", justifyContent: "center" }}>
          <div style={{ width: "100%", maxWidth: 420, background: "#fff", border: "1px solid #dadde1", borderRadius: 8, overflow: "hidden", color: "#050505" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 12px 8px" }}>
              <div style={{ width: 40, height: 40, borderRadius: isLinkedIn ? 4 : "50%", background: "#141414", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14 }}>{initials(r.brand)}</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{r.brand}</div>
                <div style={{ fontSize: 12, color: "#65676b" }}>{isLinkedIn ? "Promoted" : r.platform === "Instagram" ? "Sponsored" : "Sponsored · 🌐"}</div>
              </div>
              <div style={{ marginLeft: "auto", color: "#65676b", fontWeight: 700 }}>···</div>
            </div>
            <Zone n={1} label="Primary text · selected blocks, one idea each" />
            {body()}
            <Zone n={2} label="Creative · your image, with text overlay" />
            <div style={{ aspectRatio: isLinkedIn ? "1.91 / 1" : "1 / 1", background: "#101012", display: "flex", flexDirection: "column", justifyContent: "center", padding: 26, color: "#fff", position: "relative" }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 8, display: "flex" }}>{BLOCK_NAMES.map((n) => <span key={n} style={{ flex: 1, background: BLOCKS[n].color }} />)}</div>
              <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.15, letterSpacing: "-.01em" }}>{r.imageHeadline || r.headline}</div>
              {r.imageSubline ? <div style={{ fontSize: 14, color: "#b9b9be", marginTop: 10 }}>{r.imageSubline}</div> : null}
              <div style={{ fontSize: 12, color: "#7c7c82", position: "absolute", bottom: 18, left: 26, letterSpacing: ".04em", textTransform: "uppercase" }}>{r.domain}</div>
            </div>
            <Zone n={3} label="Headline · description · button" />
            <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#f0f2f5", padding: "10px 12px" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: "#65676b", textTransform: "uppercase", letterSpacing: ".02em" }}>{r.domain}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#1c1e21", margin: "1px 0" }}>{r.headline}</div>
                <div style={{ fontSize: 13, color: "#65676b" }}>{r.description}</div>
              </div>
              <button style={{ flex: "0 0 auto", background: "#e4e6eb", color: "#050505", fontWeight: 700, fontSize: 14, padding: "8px 14px", borderRadius: 6, border: "none", cursor: "pointer" }}>{r.cta}</button>
            </div>
            {!isLinkedIn && <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", fontSize: 13, color: "#65676b", borderBottom: "1px solid #ced0d4" }}><span>👍❤️ 1.2K</span><span>184 comments · 37 shares</span></div>}
            <div style={{ display: "flex", padding: "4px 6px", fontSize: 14, color: "#65676b", fontWeight: 600 }}>{(isLinkedIn ? ["Like", "Comment", "Repost", "Send"] : ["Like", "Comment", "Share"]).map((a) => <div key={a} style={{ flex: 1, textAlign: "center", padding: 8 }}>{a}</div>)}</div>
          </div>
        </div>
      ) : <FieldsCard r={r} body={body} />}

      {r.hooks && r.hooks.length > 0 && (
        <div style={{ marginTop: 14, borderTop: "1px solid #f0f0f2", paddingTop: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: BLOCKS.Curiosity.ink, marginBottom: 8 }}><Dot name="Curiosity" />Hook variants to test</div>
          <ol style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.5, color: "#1f1f22" }}>{r.hooks.map((h, i) => <li key={i} style={{ marginBottom: 5 }}>{h}</li>)}</ol>
        </div>
      )}
      {r.craves && Object.keys(r.craves).length > 0 && (
        <div style={{ marginTop: 14, borderTop: "1px solid #f0f0f2", paddingTop: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: "#6b6b70", marginBottom: 8 }}>Polish</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(86px, 1fr))", gap: 8 }}>
            {["Clear", "Relevant", "Accurate", "Visual", "Expressive", "Specific"].map((k) => {
              const v = Number(r.craves[k]) || 0;
              return (<div key={k}><div style={{ fontSize: 11, color: "#3a3a3e", marginBottom: 3 }}>{k}</div><div style={{ display: "flex", gap: 2 }}>{[1, 2, 3, 4, 5].map((n) => <span key={n} style={{ flex: 1, height: 5, borderRadius: 2, background: n <= v ? "#141414" : "#e8e8ea" }} />)}</div></div>);
            })}
          </div>
        </div>
      )}
      {r.creativeBrief && (
        <div style={{ marginTop: 14, background: "#141414", color: "#e7e7ea", borderRadius: 10, padding: "12px 14px" }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: "#9a9aa0", marginBottom: 4 }}>Creative brief</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>{r.creativeBrief}</div>
        </div>
      )}
    </article>
  );
}

function FieldsCard({ r, body }) {
  const note = "Video placement. The primary text is your script and caption. The first segment is the on-screen hook in the opening seconds. The CTA and image headline become on-screen text and the end card.";
  const row = (k, v) => v ? (
    <div style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: "1px solid #f0f0f2" }}>
      <div style={{ flex: "0 0 110px", fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "#9a9aa0" }}>{k}</div>
      <div style={{ fontSize: 14, color: "#1f1f22", lineHeight: 1.4 }}>{v}</div>
    </div>
  ) : null;
  return (
    <div style={{ background: "#fafafa", borderRadius: 12, padding: 14 }}>
      <div style={{ marginBottom: 8 }}>{body()}</div>
      {row("Headline", r.headline)}
      {row("Description", r.description)}
      {row("CTA", r.cta)}
      {row("Image", [r.imageHeadline, r.imageSubline].filter(Boolean).join(" / "))}
      <div style={{ fontSize: 12, color: "#9a9aa0", marginTop: 10, lineHeight: 1.5 }}>{note}</div>
    </div>
  );
}

const miniH = (c) => ({ fontSize: 10.5, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: c, marginBottom: 4 });
function AvCol({ title, items, color }) {
  if (!items || !items.length) return null;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={miniH(color)}>{title}</div>
      <ul style={{ margin: 0, paddingLeft: 16, fontSize: 13, lineHeight: 1.5, color: "#1f1f22" }}>{items.map((x, i) => <li key={i} style={{ marginBottom: 2 }}>{typeof x === "string" ? x : JSON.stringify(x)}</li>)}</ul>
    </div>
  );
}
function AvLine({ title, text, color }) {
  if (!text) return null;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={miniH(color)}>{title}</div>
      <div style={{ fontSize: 13, lineHeight: 1.5, color: "#1f1f22" }}>{text}</div>
    </div>
  )
}
