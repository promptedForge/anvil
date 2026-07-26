# Start Here

Anvil is a Prompted Forge creative-strategy ware. Mariam's Milestone 3 is the
current product baseline, not a pending rebuild.

## What is already complete

- WHAT-WHO-WHY segment builder
- persona composition
- persona-aware generation
- awareness-stage generation input
- proof, curiosity, constraints, pain, promise, offer, and angle mechanics
- local stakeholder-language projection shaped for the shared Forge substrate

## Runtime shape

The app is a projection of Forge:

1. A user signs in with an existing Prompted Forge account.
2. `src/forge-runtime.js` submits a provider-neutral request to
   `bridge-anvil-generate`.
3. Forge verifies identity, entitlement, quota reservation, and capacity policy.
4. Forge selects the provider server-side and returns text plus a content-free
   usage receipt.

There is no Anvil API key, local passcode, provider model selector, or
standalone account/limit table.

## Local setup

Install and validate:

```bash
npm ci
npm run lint
npm run test
npm run build
```

Set only public Forge browser configuration:

```text
VITE_FORGE_SUPABASE_URL=
VITE_FORGE_SUPABASE_PUBLISHABLE_KEY=
```

Do not put a provider key in this repo or in any `VITE_` variable.

## Current release gate

The interface and Forge auth projection can build without live generation.
Generation stays fail-closed until Forge has an active Anvil entitlement and an
active atomic quota policy. Exact Dream 50 reward amount, ForgeX rate,
FireCoin price, and trial duration or credit count remain market-policy
decisions.
