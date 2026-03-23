export function buildLobbyJamPath(jamId: string) {
  return `/j/${jamId}`;
}

export function buildJamRedirectUrl(ip: string, requestUrl: string) {
  const target = new URL(`http://${ip}:7681/`);
  const source = new URL(requestUrl);
  target.search = source.search;
  return target.toString();
}
