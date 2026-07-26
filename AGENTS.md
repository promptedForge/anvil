# Anvil Agent Contract

Anvil is Prompted Forge creative-strategy marketware. Mariam's Milestone 3 is
the product baseline: one product can become multiple WHAT-WHO-WHY personas,
and each persona can generate its own ads with awareness-stage input.

## Authority boundary

- Forge Supabase Auth owns identity and sessions.
- Forge Market owns ware registration, adoption, entitlement, and trial terms.
- Forge AI capacity policy owns provider and payer selection.
- Forge quota reservations own per-user limits and the company capacity cap.
- The shared stakeholder-config substrate owns vertical language. Anvil's local
  profile remains a merge-ready projection only.
- Anvil never holds a direct model-provider key and never lets the browser pick
  a provider or model.
- CRM and calendar facts are downstream Bridge projections, never Anvil truth.

## Product language

- Human role: Operative, creative strategist, or vertical owner.
- Machine role: AI Operator.
- Segment builder is the WHO layer.
- Stakeholder config is the HOW layer.

## Safety rules

- No em dash in code or generated user-facing copy.
- Do not use contrastive negation followed by a restatement.
- Never invent statistics, studies, authorities, testimonials, professional
  consensus, urgency, scarcity, guarantees, deadlines, or offer terms.
- Regulated output stays behind the existing compliance gate.
- Coverage is a neutral diagnostic, never a quality score.
- The tool proposes. A human judges before spend.

## Validation

Run:

```bash
npm ci
npm run lint
npm run test
npm run build
```

No Anvil change is complete while direct provider runtime code, a shared
passcode gate, or a client-selectable model path remains.
