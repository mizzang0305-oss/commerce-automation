export function fingerprintHammingDistance(left: string, right: string): number {
  if (!/^[0-9a-f]+$/iu.test(left) || left.length !== right.length) throw new Error("VISUAL_FINGERPRINT_INVALID");
  let distance = 0;
  for (let index = 0; index < left.length; index += 1) {
    let value = Number.parseInt(left[index], 16) ^ Number.parseInt(right[index], 16);
    while (value) { distance += value & 1; value >>>= 1; }
  }
  return distance;
}

export function isNearDuplicateFingerprint(left: string, right: string, threshold = 6): boolean {
  return fingerprintHammingDistance(left, right) <= threshold;
}
