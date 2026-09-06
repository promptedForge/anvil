import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AnvilMarketwareExtensions, {
  buildAnvilExtensionPlanningDraft,
  buildAnvilExtensionPlanningDraftFromLocalSource,
  sha256LocalText,
} from "./AnvilMarketwareExtensions.jsx";
import registry from "./anvil-marketware-extension-registry.generated.json";

describe("AnvilMarketwareExtensions", () => {
  it("auto-surfaces the two free extensions with honest provider state", () => {
    const markup = renderToStaticMarkup(
      <AnvilMarketwareExtensions
        selectedPlatform="Facebook"
        onSelectPlatform={() => {}}
      />,
    );

    expect(markup).toContain("Facebook &amp; Meta Ads");
    expect(markup).toContain("LinkedIn Management");
    expect(markup.match(/Free with Anvil/g)).toHaveLength(2);
    expect(markup.match(/Not verified/g)).toHaveLength(2);
    expect(markup.match(/Not granted/g)).toHaveLength(2);
    expect(markup).toContain("Provider effect held");
    expect(markup).toContain("<details");
    expect(markup).toContain("Plan Meta Ads");
    expect(markup).not.toContain("<details open");
    expect(markup).not.toContain("Publish campaign");
    expect(markup).not.toContain("Replace ads");
    expect(markup).not.toContain("Connect provider");
  });

  it("builds a bounded local planning artifact from hashed source bytes without provider effects", async () => {
    const draft = await buildAnvilExtensionPlanningDraftFromLocalSource({
      extensionKey: "anvil.extension.linkedin_management.v1",
      draftId: "draft-001",
      createdAt: "2026-09-06T20:00:00.000Z",
      sourceText: "abc",
      context: {
        objective: "Invite qualified operators",
        audience: "Regional operators",
        offer: "A reviewed briefing",
      },
      providerSelections: {
        authorKind: "organization",
        contentMode: "organic",
        exactAuthorUrn: "urn:li:organization:123",
      },
      sourceArtifact: {
        ref: "artifact://anvil/copy/1",
      },
    });

    expect(draft).toMatchObject({
      draftId: "draft-001",
      storagePosture: "local_browser_memory_only",
      product: {
        extensionKey: "anvil.extension.linkedin_management.v1",
        platformSelector: "LinkedIn",
      },
      workflow: {
        artifactRegistryOwner: "document_artifact_registry",
        reviewReceiptOwner: "forge_review_receipts",
        reviewReceipt: null,
        humanReviewRequired: true,
        readiness: "planning_complete_human_review_required",
        missingPrerequisites: [],
      },
      access: {
        mode: "included_with_existing_anvil_baseline_access",
        separateExtensionEntitlementRequired: false,
        providerAuthorizationInherited: false,
      },
      provider: {
        connection: "unverified",
        authorization: "not_granted",
        requestedOperation: "draft_only",
        futureOperationTarget: "create_organic_post",
        execution: "held",
        planningSelections: {
          authorKind: "organization",
          contentMode: "organic",
        },
        permissionOrRoleGates: expect.arrayContaining([
          "w_organization_social plus documented Page role for organization author",
          "w_member_social for member author",
        ]),
        protocolGates: expect.arrayContaining([
          "use /rest/posts",
          "X-Restli-Protocol-Version 2.0.0",
        ]),
      },
      effects: {
        networkRequestPerformed: false,
        providerMutationAuthorized: false,
        campaignOrPostDeleted: false,
        campaignOrPostPublished: false,
        spendAuthorized: false,
        destructiveReplacementAllowed: false,
      },
      sourceArtifact: {
        ref: "artifact://anvil/copy/1",
        sha256:
          "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
        digestBasis: "computed_from_local_bytes",
        contentIncluded: false,
      },
    });
    expect(draft.context).toEqual({
      objective: "Invite qualified operators",
      audience: "Regional operators",
      offer: "A reviewed briefing",
    });
  });

  it("computes an actual SHA-256 over exact local source bytes", async () => {
    await expect(sha256LocalText("abc")).resolves.toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    await expect(sha256LocalText("")).resolves.toBeNull();
  });

  it("names missing exact subjects and digest instead of claiming readiness", () => {
    const draft = buildAnvilExtensionPlanningDraft({
      extensionKey: "anvil.extension.meta_ads_management.v1",
      draftId: "draft-incomplete",
      createdAt: "2026-09-06T20:00:00.000Z",
      context: {},
      providerSelections: { accountRelationship: "own_account" },
      sourceArtifact: {},
    });

    expect(draft.workflow.readiness).toBe("planning_incomplete");
    expect(draft.workflow.missingPrerequisites).toEqual(
      expect.arrayContaining([
        "campaign_or_post_objective",
        "audience",
        "offer",
        "source_copy_or_creative_ref",
        "source_copy_or_creative_sha256",
        "exact_meta_ad_account",
        "exact_meta_page_identity",
        "meta_account_currency",
        "valid_meta_budget_bounds",
      ]),
    );
    expect(draft.remainingEffectGates).toEqual(
      expect.arrayContaining([
        "current provider connection readback",
        "subject, digest, and scope-bound human review receipt",
        "post-write provider readback",
      ]),
    );
  });

  it("does not attest that a caller-supplied hash was computed locally", () => {
    const draft = buildAnvilExtensionPlanningDraft({
      extensionKey: "anvil.extension.linkedin_management.v1",
      draftId: "draft-asserted-hash",
      createdAt: "2026-09-06T20:00:00.000Z",
      context: {
        objective: "Awareness",
        audience: "Operators",
        offer: "A briefing",
      },
      providerSelections: {
        authorKind: "member",
        contentMode: "sponsored",
        exactAuthorUrn: "urn:li:person:abc_123",
      },
      sourceArtifact: {
        ref: "artifact://anvil/copy/asserted",
        sha256:
          "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
      },
    });

    expect(draft.sourceArtifact.digestBasis).toBe("caller_supplied_unverified");
    expect(draft.workflow.readiness).toBe("planning_incomplete");
    expect(draft.workflow.missingPrerequisites).toContain(
      "source_copy_or_creative_digest_verification",
    );
    expect(draft.provider.futureOperationTarget).toBe(
      "prepare_sponsored_content_candidate",
    );
  });

  it("rejects reversed Meta budgets and an author-kind URN mismatch", () => {
    const meta = buildAnvilExtensionPlanningDraft({
      extensionKey: "anvil.extension.meta_ads_management.v1",
      draftId: "meta-invalid-budget",
      createdAt: "2026-09-06T20:00:00.000Z",
      context: { objective: "Leads", audience: "Buyers", offer: "Call" },
      providerSelections: {
        accountRelationship: "own_account",
        exactAdAccount: "act_123",
        pageIdentity: "456",
        currency: "USD",
        budgetMinimum: "500",
        budgetMaximum: "100",
      },
      sourceArtifact: {},
    });
    const linkedin = buildAnvilExtensionPlanningDraft({
      extensionKey: "anvil.extension.linkedin_management.v1",
      draftId: "linkedin-invalid-author",
      createdAt: "2026-09-06T20:00:00.000Z",
      context: { objective: "Reach", audience: "Members", offer: "Read" },
      providerSelections: {
        authorKind: "organization",
        contentMode: "organic",
        exactAuthorUrn: "urn:li:person:abc",
      },
      sourceArtifact: {},
    });

    expect(meta.workflow.missingPrerequisites).toContain(
      "valid_meta_budget_bounds",
    );
    expect(linkedin.workflow.missingPrerequisites).toContain(
      "exact_linkedin_author_urn_for_kind",
    );
    expect(linkedin.provider.futureOperationTarget).toBe("create_organic_post");
  });

  it("keeps the generated product projection bound to Forge Market", () => {
    expect(registry.registryOwner).toBe("forge_market");
    expect(registry.productBinding.baselineWareKey).toBe(
      "ware.anvil_creative_strategy.v1",
    );
    expect(registry.access.separateExtensionEntitlementRequired).toBe(false);
    expect(registry.nativeWorkflow.effectAuthorityMinted).toBe(false);
    expect(registry.nativeWorkflow.destructiveReplacementAllowed).toBe(false);
  });

  it("rejects unknown or incomplete planning draft subjects", () => {
    expect(
      buildAnvilExtensionPlanningDraft({
        extensionKey: "unknown",
        draftId: "draft-001",
        createdAt: "2026-09-06T20:00:00.000Z",
      }),
    ).toBeNull();
    expect(
      buildAnvilExtensionPlanningDraft({
        extensionKey: "anvil.extension.meta_ads_management.v1",
        draftId: "",
        createdAt: "2026-09-06T20:00:00.000Z",
      }),
    ).toBeNull();
  });
});
