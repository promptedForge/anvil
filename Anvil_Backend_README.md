# Anvil Forge Runtime

Anvil has no standalone model backend. The old Vercel provider relay and shared
passcode were removed.

## Browser contract

`src/forge-runtime.js` uses public Forge Supabase configuration for:

- Forge Auth session handling
- invoking the JWT-required `bridge-anvil-generate` Edge function
- provider-neutral prompt, system guidance, and maximum-token input

The browser cannot submit a provider, model, API key, billing source, wallet
movement, exchange rate, or entitlement assertion.

## Server contract

Forge owns:

- authentication and organization scope
- active Market entitlement lookup
- atomic per-user and company quota reservation
- AI capacity policy resolution
- optional canonical-mount capacity routing when that exact binding is live
- content-free attempt and terminal usage receipts

The standalone Anvil deployment is therefore a UI projection. It is not an
account, provider, settlement, stakeholder-config, or governance authority.

## Required public environment

```text
VITE_FORGE_SUPABASE_URL=
VITE_FORGE_SUPABASE_PUBLISHABLE_KEY=
```

These are normal public Supabase browser values. No service-role key, provider
key, broker secret, password, or token belongs in this deployment.

## Release checks

```bash
npm ci
npm run lint
npm run test
npm run build
```

Also verify that repository search finds no direct provider endpoint, provider
key environment name, shared access-code header, or client model selector.
