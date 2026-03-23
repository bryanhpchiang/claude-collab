# Jam Agent Instructions

Follow the project guidance in `CLAUDE.md`.

## Solve The Real Requirement

- Implement the underlying capability the user asked for, not a superficial approximation of it.
- Do not satisfy a product requirement with hardcoded UI, simulated behavior, guessed values, mock data, or placeholder logic unless the user explicitly asked for a prototype or mock.
- If the requested UX depends on missing backend support, instrumentation, or real state, build that support first or clearly report the blocker. Do not quietly replace it with a fake frontend-only version.
- When a request is ambiguous, optimize for the user's actual outcome, not the cheapest interpretation that makes the ticket look complete.
