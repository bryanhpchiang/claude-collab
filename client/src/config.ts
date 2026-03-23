export const DEFAULT_CLERK_PUBLISHABLE_KEY =
  "pk_test_Y2FwYWJsZS1oZXJtaXQtMTUuY2xlcmsuYWNjb3VudHMuZGV2JA";

export function resolveClerkPublishableKey(env: {
  VITE_CLERK_PUBLISHABLE_KEY?: string;
}) {
  return env.VITE_CLERK_PUBLISHABLE_KEY?.trim() || DEFAULT_CLERK_PUBLISHABLE_KEY;
}
