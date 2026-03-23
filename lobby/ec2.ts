type InstanceLike = {
  PublicIpAddress?: string | null;
};

type WaitForPublicIpOptions = {
  maxAttempts?: number;
  delayMs?: number;
};

function isRetryableInstanceLookupError(err: unknown) {
  const name = typeof err === "object" && err && "name" in err ? String(err.name) : "";
  const message =
    typeof err === "object" && err && "message" in err ? String(err.message) : "";

  return (
    name === "InvalidInstanceID.NotFound" ||
    message.includes("does not exist")
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForPublicIp(
  loadInstance: () => Promise<InstanceLike | undefined>,
  options: WaitForPublicIpOptions = {},
): Promise<string> {
  const maxAttempts = options.maxAttempts ?? 20;
  const delayMs = options.delayMs ?? 3000;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const instance = await loadInstance();
      if (instance?.PublicIpAddress) {
        return instance.PublicIpAddress;
      }
    } catch (err) {
      const isLastAttempt = attempt === maxAttempts - 1;
      if (!isRetryableInstanceLookupError(err) || isLastAttempt) {
        throw err;
      }
    }

    if (attempt < maxAttempts - 1) {
      await sleep(delayMs);
    }
  }

  throw new Error("Timed out waiting for public IP");
}
