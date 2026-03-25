# Jam Agent Instructions

Follow the project guidance in `CLAUDE.md`.

## Do Not Reimplement Shared Code

Before writing any utility function, **check `packages/shared/src/` first**. If the function already exists there, import it — do not rewrite it in your package. If a new helper would be useful across packages, add it to `shared/` instead of duplicating it.

## GitHub Tokens and Git Push

When a user saves a GitHub token via the secrets panel, the runtime automatically stores it in `~/.git-credentials`. Just run `git push` directly — no need to look up or pass the token manually.

## Solve The Real Requirement

- Implement the underlying capability the user asked for, not a superficial approximation of it.
- Do not satisfy a product requirement with hardcoded UI, simulated behavior, guessed values, mock data, or placeholder logic unless the user explicitly asked for a prototype or mock.
- If the requested UX depends on missing backend support, instrumentation, or real state, build that support first or clearly report the blocker. Do not quietly replace it with a fake frontend-only version.
- When a request is ambiguous, optimize for the user's actual outcome, not the cheapest interpretation that makes the ticket look complete.
