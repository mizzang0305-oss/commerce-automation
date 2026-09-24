import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type StudioHostSignature = { hostId: string; timestamp: string; nonce: string; signature: string };

export function signStudioHostRequest(input: {
  secret: string; hostId: string; method: string; pathname: string; timestamp: string; nonce: string; body: string;
}): StudioHostSignature {
  if (!input.secret || !input.hostId || !/^[0-9a-f-]{36}$/iu.test(input.nonce)) throw new Error("STUDIO_HOST_SIGNING_CONFIG_INVALID");
  const material = canonicalMaterial(input);
  return { hostId: input.hostId, timestamp: input.timestamp, nonce: input.nonce,
    signature: createHmac("sha256", input.secret).update(material).digest("hex") };
}

export function verifyStudioHostRequest(input: {
  secret: string; expectedHostId: string; method: string; pathname: string; body: string;
  headers: StudioHostSignature; now?: Date;
}) {
  const { headers } = input;
  const time = Date.parse(headers.timestamp);
  if (!input.secret || headers.hostId !== input.expectedHostId || !Number.isFinite(time) ||
      Math.abs((input.now ?? new Date()).getTime() - time) > 300_000 ||
      !/^[0-9a-f-]{36}$/iu.test(headers.nonce) || !/^[0-9a-f]{64}$/iu.test(headers.signature)) return false;
  const expected = signStudioHostRequest({ ...input, hostId: headers.hostId, timestamp: headers.timestamp, nonce: headers.nonce });
  return timingSafeEqual(Buffer.from(expected.signature, "hex"), Buffer.from(headers.signature, "hex"));
}

function canonicalMaterial(input: { hostId: string; method: string; pathname: string; timestamp: string; nonce: string; body: string }) {
  const bodyHash = createHash("sha256").update(input.body).digest("hex");
  return [input.hostId, input.method.toUpperCase(), input.pathname, input.timestamp, input.nonce, bodyHash].join("\n");
}
