import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

// Новая сборка хранит секрет получения результата только на устройстве.
// В Telegram уходит идентификатор, полученный из секрета, а не сам секрет.
function tokenFor(proof: string, linkTicket: string) {
  return "d2" + createHash("sha256").update(proof).update(":").update(linkTicket).digest("hex").slice(0, 32);
}

export function createTelegramAttempt(linkTicket = "") {
  const proof = randomBytes(32).toString("hex");
  return { token: tokenFor(proof, linkTicket), proof };
}

export function isDeviceAttempt(token: string) {
  return /^d2[0-9a-f]{32}$/.test(token);
}

export function matchesDevice(token: string, proof: unknown, linkTicket = "") {
  if (!isDeviceAttempt(token) || typeof proof !== "string" || !/^[0-9a-f]{64}$/.test(proof)) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(tokenFor(proof, linkTicket)));
}
