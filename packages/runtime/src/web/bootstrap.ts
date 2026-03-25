import { readBootstrapData } from "shared";
import type { RuntimeBootstrap } from "./types";

export const RUNTIME_BOOTSTRAP_ID = "jam-runtime-bootstrap";

export function readRuntimeBootstrap() {
  return readBootstrapData<RuntimeBootstrap>(RUNTIME_BOOTSTRAP_ID);
}
