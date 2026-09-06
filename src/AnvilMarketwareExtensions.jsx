import React, { useEffect, useMemo, useState } from "react";
import extensionRegistry from "./anvil-marketware-extension-registry.generated.json";

const shell = {
  marginBottom: 18,
  padding: 18,
  border: "1px solid #dedee3",
  borderRadius: 12,
  background: "linear-gradient(135deg, #fff 0%, #faf8ff 100%)",
  boxShadow: "0 4px 20px rgba(32, 20, 52, 0.05)",
};

const card = {
  display: "flex",
  minWidth: 0,
  flexDirection: "column",
  gap: 10,
  padding: 14,
  border: "1px solid #e2e2e7",
  borderRadius: 10,
  background: "#fff",
};

const badge = {
  display: "inline-flex",
  alignItems: "center",
  borderRadius: 999,
  padding: "4px 8px",
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: ".06em",
  textTransform: "uppercase",
};

const button = {
  width: "100%",
  padding: "9px 12px",
  border: "1px solid #d4d4d8",
  borderRadius: 8,
  background: "#fff",
  color: "#18181b",
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: 12,
  fontWeight: 800,
};

function cleanDraftContext(value) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, 4000);
}

export async function sha256LocalText(value) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    typeof crypto === "undefined" ||
    !crypto.subtle
  ) {
    return null;
  }
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function getAnvilMarketwareExtension(extensionKey) {
  return (
    extensionRegistry.extensions.find(
      (extension) => extension.extensionKey === extensionKey,
    ) || null
  );
}

function buildPlanningDraftWithDigestTruth({
  extensionKey,
  draftId,
  createdAt,
  context = {},
  providerSelections = {},
  sourceArtifact = {},
}, digestTruth) {
  const extension = getAnvilMarketwareExtension(extensionKey);
  if (
    !extension ||
    typeof draftId !== "string" ||
    !draftId.trim() ||
    typeof createdAt !== "string" ||
    !createdAt.trim()
  ) {
    return null;
  }

  const cleanedContext = {
    objective: cleanDraftContext(context.objective),
    audience: cleanDraftContext(context.audience),
    offer: cleanDraftContext(context.offer),
  };
  const cleanedSelections = Object.fromEntries(
    Object.entries(providerSelections).map(([key, value]) => [
      String(key).trim().slice(0, 100),
      cleanDraftContext(value),
    ]),
  );
  const sourceRef = cleanDraftContext(sourceArtifact.ref);
  const sourceSha256 =
    typeof sourceArtifact.sha256 === "string" &&
    /^[a-f0-9]{64}$/.test(sourceArtifact.sha256)
      ? sourceArtifact.sha256
      : null;
  const missingPrerequisites = [];
  if (!cleanedContext.objective) missingPrerequisites.push("campaign_or_post_objective");
  if (!cleanedContext.audience) missingPrerequisites.push("audience");
  if (!cleanedContext.offer) missingPrerequisites.push("offer");
  if (!sourceRef) missingPrerequisites.push("source_copy_or_creative_ref");
  if (!sourceSha256) missingPrerequisites.push("source_copy_or_creative_sha256");
  if (sourceSha256 && digestTruth !== "computed_from_local_bytes") {
    missingPrerequisites.push("source_copy_or_creative_digest_verification");
  }

  if (extension.capabilityRef === "meta_ads_management") {
    if (!["own_account", "other_account"].includes(cleanedSelections.accountRelationship)) {
      missingPrerequisites.push("meta_account_relationship");
    }
    if (!/^act_[0-9]+$/.test(cleanedSelections.exactAdAccount || "")) {
      missingPrerequisites.push("exact_meta_ad_account");
    }
    if (!cleanedSelections.pageIdentity) missingPrerequisites.push("exact_meta_page_identity");
    if (!/^[A-Z]{3}$/.test(cleanedSelections.currency || "")) {
      missingPrerequisites.push("meta_account_currency");
    }
    const budgetMinimum = Number(cleanedSelections.budgetMinimum);
    const budgetMaximum = Number(cleanedSelections.budgetMaximum);
    if (
      !Number.isFinite(budgetMinimum) ||
      !Number.isFinite(budgetMaximum) ||
      budgetMinimum <= 0 ||
      budgetMaximum < budgetMinimum
    ) {
      missingPrerequisites.push("valid_meta_budget_bounds");
    }
  } else {
    const authorKind = cleanedSelections.authorKind;
    const contentMode = cleanedSelections.contentMode;
    if (!["organization", "member"].includes(authorKind)) {
      missingPrerequisites.push("linkedin_author_kind");
    }
    if (!["organic", "sponsored"].includes(contentMode)) {
      missingPrerequisites.push("linkedin_content_mode");
    }
    const exactAuthorUrn = cleanedSelections.exactAuthorUrn || "";
    const authorUrnMatches =
      (authorKind === "organization" &&
        /^urn:li:organization:[0-9]+$/.test(exactAuthorUrn)) ||
      (authorKind === "member" &&
        /^urn:li:person:[A-Za-z0-9_-]+$/.test(exactAuthorUrn));
    if (!authorUrnMatches) missingPrerequisites.push("exact_linkedin_author_urn_for_kind");
  }

  const futureOperationTarget =
    extension.capabilityRef === "meta_ads_management"
      ? "create_paused_campaign"
      : cleanedSelections.contentMode === "organic"
        ? "create_organic_post"
        : cleanedSelections.contentMode === "sponsored"
          ? "prepare_sponsored_content_candidate"
          : null;

  return {
    schemaVersion: "anvil.extension_planning_draft.v1",
    draftId: draftId.trim(),
    createdAt: createdAt.trim(),
    storagePosture: "local_browser_memory_only",
    registry: {
      registryId: extensionRegistry.registryId,
      registryOwner: extensionRegistry.registryOwner,
      sourceRef: extensionRegistry.sourceRef,
      projectionPosture: extensionRegistry.projectionPosture,
    },
    product: {
      primitiveKey: extensionRegistry.productBinding.primitiveKey,
      baselineWareKey: extensionRegistry.productBinding.baselineWareKey,
      extensionKey: extension.extensionKey,
      wareKey: extension.wareKey,
      platformSelector: extension.platformSelector,
    },
    context: cleanedContext,
    sourceArtifact: {
      ref: sourceRef || null,
      sha256: sourceSha256,
      digestBasis: sourceSha256
        ? digestTruth
        : "unavailable_without_local_bytes",
      contentIncluded: false,
    },
    workflow: {
      workflowKey: extensionRegistry.nativeWorkflow.workflowKey,
      state: "planning",
      artifactRegistryOwner:
        extensionRegistry.nativeWorkflow.artifactRegistryOwner,
      reviewReceiptOwner: extensionRegistry.nativeWorkflow.reviewReceiptOwner,
      reviewReceipt: null,
      humanReviewRequired: true,
      budgetPolicyReceipt: null,
      readiness:
        missingPrerequisites.length === 0
          ? "planning_complete_human_review_required"
          : "planning_incomplete",
      missingPrerequisites,
    },
    access: {
      entitlementOwner: extensionRegistry.nativeWorkflow.entitlementOwner,
      mode: extensionRegistry.access.accessMode,
      separateExtensionEntitlementRequired: false,
      providerAuthorizationInherited: false,
    },
    provider: {
      provider: extension.providerReadiness.provider,
      connection: "unverified",
      authorization: "not_granted",
      accountSelection: "unresolved",
      requestedOperation: "draft_only",
      futureOperationTarget,
      execution: "held",
      planningFields: [...extension.futureConnectorContract.planningFields],
      planningSelections: cleanedSelections,
      permissionOrRoleGates: [
        ...extension.futureConnectorContract.permissionOrRoleGates,
      ],
      protocolGates: [...extension.futureConnectorContract.protocolGates],
    },
    effects: {
      networkRequestPerformed: false,
      providerMutationAuthorized: false,
      campaignOrPostCreated: false,
      campaignOrPostUpdated: false,
      campaignOrPostDeleted: false,
      campaignOrPostPublished: false,
      spendAuthorized: false,
      destructiveReplacementAllowed: false,
    },
    remainingEffectGates: [
      "current provider connection readback",
      "scoped provider authorization and role readback",
      "supported provider API version and payload validation",
      "subject, digest, and scope-bound human review receipt",
      "provider effect lease with idempotency and compensation contract",
      "post-write provider readback",
    ],
    nextGate:
      "complete the copy candidate, then obtain human review and the provider-specific receipts before any provider handoff",
  };
}

export function buildAnvilExtensionPlanningDraft(input) {
  return buildPlanningDraftWithDigestTruth(
    input,
    "caller_supplied_unverified",
  );
}

export async function buildAnvilExtensionPlanningDraftFromLocalSource({
  sourceText,
  ...input
}) {
  const sourceSha256 = await sha256LocalText(sourceText);
  return buildPlanningDraftWithDigestTruth(
    {
      ...input,
      sourceArtifact: {
        ref: input.sourceArtifact?.ref,
        sha256: sourceSha256,
      },
    },
    sourceSha256
      ? "computed_from_local_bytes"
      : "unavailable_without_local_bytes",
  );
}

function ExtensionCard({ extension, selected, onSelect }) {
  return (
    <article style={{ ...card, borderColor: selected ? "#8e3b8e" : card.border }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <span style={{ ...badge, background: "#e7f5ec", color: "#155c34" }}>
          Free with Anvil
        </span>
        <span style={{ ...badge, background: "#f1f1f4", color: "#55545a" }}>
          Automatically available
        </span>
      </div>
      <div>
        <h3 style={{ margin: 0, fontSize: 16, color: "#171719" }}>
          {extension.label}
        </h3>
        <p style={{ margin: "5px 0 0", color: "#66666d", fontSize: 12.5, lineHeight: 1.5 }}>
          Build a local plan and generate copy in the existing Anvil workspace.
        </p>
      </div>
      <dl style={{ display: "grid", gap: 5, margin: 0, fontSize: 11.5 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <dt style={{ color: "#77777e" }}>Provider connection</dt>
          <dd style={{ margin: 0, fontWeight: 800 }}>Not verified</dd>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <dt style={{ color: "#77777e" }}>Provider authorization</dt>
          <dd style={{ margin: 0, fontWeight: 800 }}>Not granted</dd>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <dt style={{ color: "#77777e" }}>Provider actions</dt>
          <dd style={{ margin: 0, fontWeight: 800, color: "#8a4a00" }}>Held</dd>
        </div>
      </dl>
      <button type="button" style={button} onClick={() => onSelect(extension)}>
        {selected ? "Selected in Anvil" : `Work on ${extension.shortLabel}`}
      </button>
    </article>
  );
}

export default function AnvilMarketwareExtensions({
  selectedPlatform,
  onSelectPlatform,
  draftContext = {},
}) {
  const initialExtension =
    extensionRegistry.extensions.find(
      (extension) => extension.platformSelector === selectedPlatform,
    ) || extensionRegistry.extensions[0];
  const [activeExtensionKey, setActiveExtensionKey] = useState(
    initialExtension.extensionKey,
  );
  const [draft, setDraft] = useState(null);
  const [copyState, setCopyState] = useState("idle");
  const [providerSelections, setProviderSelections] = useState({
    accountRelationship: "own_account",
    authorKind: "organization",
    contentMode: "organic",
  });
  const [planInputs, setPlanInputs] = useState({
    objective: "",
    audience: "",
    offer: "",
    exactAdAccount: "",
    pageIdentity: "",
    currency: "",
    budgetMinimum: "",
    budgetMaximum: "",
    exactAuthorUrn: "",
    sourceArtifactRef: "",
    sourceText: "",
  });
  const activeExtension = useMemo(
    () =>
      getAnvilMarketwareExtension(activeExtensionKey) ||
      extensionRegistry.extensions[0],
    [activeExtensionKey],
  );

  useEffect(() => {
    const selectedExtension = extensionRegistry.extensions.find(
      (extension) => extension.platformSelector === selectedPlatform,
    );
    if (selectedExtension) {
      setActiveExtensionKey(selectedExtension.extensionKey);
      setDraft(null);
      setCopyState("idle");
    }
  }, [selectedPlatform]);

  function selectExtension(extension) {
    setActiveExtensionKey(extension.extensionKey);
    setDraft(null);
    setCopyState("idle");
    if (typeof onSelectPlatform === "function") {
      onSelectPlatform(extension.platformSelector);
    }
    if (typeof document !== "undefined") {
      const workspace = document.getElementById("anvil-generator-workspace");
      workspace?.scrollIntoView({ behavior: "smooth", block: "start" });
      workspace?.focus?.({ preventScroll: true });
    }
  }

  function setPlanInput(key, value) {
    setPlanInputs((current) => ({ ...current, [key]: value }));
  }

  async function prepareDraft() {
    const createdAt = new Date().toISOString();
    setDraft(
      await buildAnvilExtensionPlanningDraftFromLocalSource({
        extensionKey: activeExtension.extensionKey,
        draftId: `anvil-extension-${createdAt}`,
        createdAt,
        sourceText: planInputs.sourceText,
        context: {
          objective: planInputs.objective || draftContext.objective,
          audience: planInputs.audience || draftContext.audience,
          offer: planInputs.offer || draftContext.offer,
        },
        providerSelections:
          activeExtension.capabilityRef === "meta_ads_management"
            ? {
                accountRelationship: providerSelections.accountRelationship,
                exactAdAccount: planInputs.exactAdAccount,
                pageIdentity: planInputs.pageIdentity,
                currency: planInputs.currency,
                budgetMinimum: planInputs.budgetMinimum,
                budgetMaximum: planInputs.budgetMaximum,
              }
            : {
                authorKind: providerSelections.authorKind,
                contentMode: providerSelections.contentMode,
                exactAuthorUrn: planInputs.exactAuthorUrn,
              },
        sourceArtifact: {
          ref: planInputs.sourceArtifactRef,
        },
      }),
    );
    setCopyState("idle");
  }

  async function copyDraft() {
    if (!draft || typeof navigator === "undefined" || !navigator.clipboard) {
      setCopyState("unavailable");
      return;
    }
    try {
      await navigator.clipboard.writeText(JSON.stringify(draft, null, 2));
      setCopyState("copied");
    } catch {
      setCopyState("unavailable");
    }
  }

  return (
    <section
      aria-labelledby="anvil-marketware-extensions-heading"
      data-testid="anvil-marketware-extensions"
      style={shell}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
        <div>
          <div style={{ color: "#8e3b8e", fontSize: 10, fontWeight: 900, letterSpacing: ".13em", textTransform: "uppercase" }}>
            Anvil extensions · Forge Marketware
          </div>
          <h2 id="anvil-marketware-extensions-heading" style={{ margin: "5px 0 0", color: "#171719", fontSize: 19 }}>
            Plan Meta ads and LinkedIn work here
          </h2>
          <p style={{ maxWidth: 720, margin: "6px 0 0", color: "#66666d", fontSize: 12.5, lineHeight: 1.55 }}>
            Both extensions are included with existing Anvil access. This workbench prepares local planning artifacts and routes copy into Anvil. Provider connection, account selection, authorization, publishing, and spend remain separate gated steps.
          </p>
        </div>
        <span style={{ ...badge, background: "#fff5df", color: "#7a4b00" }}>
          Provider effect held
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: 12, marginTop: 14 }}>
        {extensionRegistry.extensions.map((extension) => (
          <ExtensionCard
            key={extension.extensionKey}
            extension={extension}
            selected={activeExtension.extensionKey === extension.extensionKey}
            onSelect={selectExtension}
          />
        ))}
      </div>

      <details style={{ ...card, marginTop: 12, background: "#fbfbfc" }}>
        <summary style={{ cursor: "pointer", color: "#29282d", fontSize: 13, fontWeight: 900 }}>
          Plan {activeExtension.shortLabel}
        </summary>
        <div style={{ marginTop: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))", gap: 10, marginBottom: 10 }}>
          {[
            ["objective", "Campaign or post objective", draftContext.objective || "e.g. Lead generation"],
            ["audience", "Audience", draftContext.audience || "Who should receive this?"],
            ["offer", "Offer or next step", draftContext.offer || "What does the copy invite?"],
          ].map(([key, labelText, placeholder]) => (
            <label key={key} style={{ color: "#55545a", fontSize: 11.5, fontWeight: 700 }}>
              {labelText}
              <input
                aria-label={labelText}
                value={planInputs[key]}
                placeholder={placeholder}
                onChange={(event) => setPlanInput(key, event.target.value)}
                style={{ display: "block", width: "100%", boxSizing: "border-box", marginTop: 5, padding: "8px 9px", border: "1px solid #d8d8de", borderRadius: 8, background: "#fff", fontFamily: "inherit", fontSize: 12 }}
              />
            </label>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))", gap: 10 }}>
          {activeExtension.capabilityRef === "meta_ads_management" ? (
            <>
              <label style={{ color: "#55545a", fontSize: 11.5, fontWeight: 700 }}>
                Planned account relationship
                <select
                  aria-label="Planned Meta account relationship"
                  value={providerSelections.accountRelationship}
                  onChange={(event) =>
                    setProviderSelections((current) => ({
                      ...current,
                      accountRelationship: event.target.value,
                    }))
                  }
                  style={{ display: "block", width: "100%", marginTop: 5, padding: "8px 9px", border: "1px solid #d8d8de", borderRadius: 8, background: "#fff", fontFamily: "inherit", fontSize: 12 }}
                >
                  <option value="own_account">Own ad account</option>
                  <option value="other_account">Another ad account</option>
                </select>
              </label>
              {[
                ["exactAdAccount", "Exact Meta ad account", "act_..."],
                ["pageIdentity", "Exact Meta Page identity", "Page ID or governed reference"],
                ["currency", "Account currency", "e.g. USD"],
                ["budgetMinimum", "Planned budget minimum", "Planning value only"],
                ["budgetMaximum", "Planned budget maximum", "Planning value only"],
              ].map(([key, labelText, placeholder]) => (
                <label key={key} style={{ color: "#55545a", fontSize: 11.5, fontWeight: 700 }}>
                  {labelText}
                  <input
                    aria-label={labelText}
                    value={planInputs[key]}
                    placeholder={placeholder}
                    onChange={(event) => setPlanInput(key, event.target.value)}
                    style={{ display: "block", width: "100%", boxSizing: "border-box", marginTop: 5, padding: "8px 9px", border: "1px solid #d8d8de", borderRadius: 8, background: "#fff", fontFamily: "inherit", fontSize: 12 }}
                  />
                </label>
              ))}
            </>
          ) : (
            <>
              <label style={{ color: "#55545a", fontSize: 11.5, fontWeight: 700 }}>
                Planned LinkedIn author
                <select
                  aria-label="Planned LinkedIn author kind"
                  value={providerSelections.authorKind}
                  onChange={(event) =>
                    setProviderSelections((current) => ({
                      ...current,
                      authorKind: event.target.value,
                    }))
                  }
                  style={{ display: "block", width: "100%", marginTop: 5, padding: "8px 9px", border: "1px solid #d8d8de", borderRadius: 8, background: "#fff", fontFamily: "inherit", fontSize: 12 }}
                >
                  <option value="organization">Organization Page</option>
                  <option value="member">Member</option>
                </select>
              </label>
              <label style={{ color: "#55545a", fontSize: 11.5, fontWeight: 700 }}>
                Planned LinkedIn format
                <select
                  aria-label="Planned LinkedIn content mode"
                  value={providerSelections.contentMode}
                  onChange={(event) =>
                    setProviderSelections((current) => ({
                      ...current,
                      contentMode: event.target.value,
                    }))
                  }
                  style={{ display: "block", width: "100%", marginTop: 5, padding: "8px 9px", border: "1px solid #d8d8de", borderRadius: 8, background: "#fff", fontFamily: "inherit", fontSize: 12 }}
                >
                  <option value="organic">Organic post</option>
                  <option value="sponsored">Sponsored content candidate</option>
                </select>
              </label>
              <label style={{ color: "#55545a", fontSize: 11.5, fontWeight: 700 }}>
                Exact LinkedIn author URN
                <input
                  aria-label="Exact LinkedIn author URN"
                  value={planInputs.exactAuthorUrn}
                  placeholder="urn:li:organization:... or urn:li:person:..."
                  onChange={(event) => setPlanInput("exactAuthorUrn", event.target.value)}
                  style={{ display: "block", width: "100%", boxSizing: "border-box", marginTop: 5, padding: "8px 9px", border: "1px solid #d8d8de", borderRadius: 8, background: "#fff", fontFamily: "inherit", fontSize: 12 }}
                />
              </label>
            </>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: 10, marginTop: 10 }}>
          <label style={{ color: "#55545a", fontSize: 11.5, fontWeight: 700 }}>
            Source copy or creative reference
            <input
              aria-label="Source copy or creative reference"
              value={planInputs.sourceArtifactRef}
              placeholder="artifact://... or a local working reference"
              onChange={(event) => setPlanInput("sourceArtifactRef", event.target.value)}
              style={{ display: "block", width: "100%", boxSizing: "border-box", marginTop: 5, padding: "8px 9px", border: "1px solid #d8d8de", borderRadius: 8, background: "#fff", fontFamily: "inherit", fontSize: 12 }}
            />
          </label>
          <label style={{ color: "#55545a", fontSize: 11.5, fontWeight: 700 }}>
            Source bytes for local SHA-256
            <textarea
              aria-label="Source bytes for local SHA-256"
              value={planInputs.sourceText}
              placeholder="Paste the exact current copy or creative description. It stays in this browser and only its SHA-256 enters the planning draft."
              onChange={(event) => setPlanInput("sourceText", event.target.value)}
              style={{ display: "block", width: "100%", minHeight: 70, boxSizing: "border-box", resize: "vertical", marginTop: 5, padding: "8px 9px", border: "1px solid #d8d8de", borderRadius: 8, background: "#fff", fontFamily: "inherit", fontSize: 12 }}
            />
          </label>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
          <div>
            <div style={{ color: "#55545a", fontSize: 11, fontWeight: 800 }}>
              Native planning draft · {activeExtension.shortLabel}
            </div>
            <div style={{ marginTop: 3, color: "#77777e", fontSize: 11.5 }}>
              Local browser memory only. Preparing or copying this draft makes no provider request.
            </div>
          </div>
          <button type="button" style={{ ...button, width: "auto" }} onClick={() => { void prepareDraft(); }}>
            Prepare local planning draft
          </button>
        </div>

        {draft ? (
          <div style={{ marginTop: 10 }}>
            <textarea
              aria-label="Local extension planning draft"
              readOnly
              value={JSON.stringify(draft, null, 2)}
              style={{ width: "100%", minHeight: 180, boxSizing: "border-box", resize: "vertical", border: "1px solid #d8d8de", borderRadius: 8, padding: 10, background: "#fff", color: "#303036", fontFamily: "ui-monospace, Menlo, Consolas, monospace", fontSize: 11, lineHeight: 1.45 }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
              <button type="button" style={{ ...button, width: "auto" }} onClick={copyDraft}>
                Copy local draft
              </button>
              <span aria-live="polite" style={{ color: "#66666d", fontSize: 11.5 }}>
                {copyState === "copied"
                  ? "Copied"
                  : copyState === "unavailable"
                    ? "Clipboard unavailable. The draft remains visible above."
                    : "Human review is required before any provider handoff."}
              </span>
            </div>
            <div style={{ marginTop: 8, color: draft.workflow.missingPrerequisites.length ? "#8a4a00" : "#155c34", fontSize: 11.5, lineHeight: 1.5 }}>
              {draft.workflow.missingPrerequisites.length
                ? `Planning remains incomplete: ${draft.workflow.missingPrerequisites.join(", ")}. Provider connection, authorization, human review, and effect lease also remain required.`
                : "Planning inputs are complete. Human review and every provider effect gate remain required."}
            </div>
          </div>
        ) : null}
        </div>
      </details>
    </section>
  );
}
