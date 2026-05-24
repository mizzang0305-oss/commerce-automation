import "server-only";

export function verifyWorkerRequest(request: Request): boolean {
  const secret = process.env.WORKER_API_SECRET;
  if (!secret) {
    return false;
  }

  const authorization = request.headers.get("authorization") ?? "";
  return authorization === `Bearer ${secret}`;
}

export function getWorkerAuthError() {
  return { ok: false, message: "Unauthorized worker request." };
}
