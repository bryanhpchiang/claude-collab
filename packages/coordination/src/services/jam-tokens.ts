import { createRandomToken, hashToken, signToken } from "shared";

export { createRandomToken };

export async function hashInviteToken(token: string) {
  return hashToken(token);
}

export async function signJamToken(secret: string, payload: Record<string, unknown>) {
  return signToken(secret, payload);
}
