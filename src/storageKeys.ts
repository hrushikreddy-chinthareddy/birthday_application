const PREFIX = "mystery-asset-pack";

export function adminSessionKey(roomCode: string) {
  return `${PREFIX}:admin:${roomCode.toUpperCase()}`;
}

export function teamSessionKey(roomCode: string) {
  return `${PREFIX}:team:${roomCode.toUpperCase()}`;
}

export function joinUrlForCode(roomCode: string) {
  const code = roomCode.toUpperCase();
  const base = import.meta.env.BASE_URL.replace(/\/$/, "") || "";
  return `${window.location.origin}${base}/join?code=${encodeURIComponent(code)}`;
}
