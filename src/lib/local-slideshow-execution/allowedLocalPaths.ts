import path from "node:path";

const repoRelativeAllowlist = [
  "commerce-assets/output/generated/",
  "commerce-assets/output/selected/",
  "commerce-assets/output/video-packages/",
  "tests/fixtures/local-slideshow-render/"
];

const driveAllowlist = [
  "G:/My Drive/commerce-assets/generated/",
  "G:/My Drive/commerce-assets/selected/"
];

function slashPath(value: string) {
  return value.replace(/\\/g, "/");
}

function isDriveAllowed(value: string) {
  const normalized = slashPath(value);
  return driveAllowlist.some((allowedPrefix) => normalized.startsWith(allowedPrefix));
}

function resolveRepoRelative(value: string) {
  const normalized = slashPath(value).replace(/^\/+/, "");
  if (!repoRelativeAllowlist.some((allowedPrefix) => normalized.startsWith(allowedPrefix))) {
    return null;
  }
  const resolved = path.join(/* turbopackIgnore: true */ process.cwd(), normalized);
  const cwd = path.join(/* turbopackIgnore: true */ process.cwd());
  return resolved.startsWith(cwd + path.sep) || resolved === cwd ? resolved : null;
}

export function isAllowedLocalRenderPath(value: string) {
  if (!value || /[\0\r\n]/.test(value)) {
    return false;
  }
  if (/^[a-z]+:\/\//i.test(value)) {
    return false;
  }
  if (value.includes("..")) {
    return false;
  }
  if (isDriveAllowed(value)) {
    return true;
  }
  return resolveRepoRelative(value) !== null;
}

export function resolveAllowedLocalRenderPath(value: string) {
  if (!isAllowedLocalRenderPath(value)) {
    return null;
  }
  if (isDriveAllowed(value)) {
    return path.normalize(value);
  }
  return resolveRepoRelative(value);
}

export function toRepoRelativeLocalRenderPath(value: string) {
  if (isDriveAllowed(value)) {
    return slashPath(value);
  }
  const resolved = path.normalize(value);
  const cwd = path.join(/* turbopackIgnore: true */ process.cwd());
  if (resolved.startsWith(cwd + path.sep)) {
    return slashPath(path.relative(cwd, resolved));
  }
  return slashPath(value);
}
