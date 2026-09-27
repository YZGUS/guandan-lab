export function createActionId() {
  // getRandomValues also works on private-LAN HTTP origins.
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
