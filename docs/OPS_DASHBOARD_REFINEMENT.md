# Ops Dashboard Refinement

This PR adds operator-facing production pilot readiness visibility.

## Scope

- Show required env, missing env, forbidden public secret, and manual pending counts.
- Show safety locks for deploy execution, Vercel CLI invocation, raw secret output, and platform upload state.
- Add `GET /api/ops/production-readiness`.
- Add `/ops/production-readiness`.
- Add dashboard summary cards.

## Non-goals

- No Vercel project creation.
- No Vercel env input.
- No Vercel deploy.
- No production smoke.
- No production diagnostics call.
- No platform upload implementation.

## Safe Response Contract

The readiness API returns counts and booleans only. It must not return raw env values, URLs, tokens, Authorization headers, or service role keys.

## Rollback

Remove the dashboard panels and `/api/ops/production-readiness` route. No production state is mutated by this feature.
