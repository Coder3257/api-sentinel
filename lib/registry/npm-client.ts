import semver from "semver";

/**
 * Fetch the latest version of a package from the npm registry using the 'latest' dist-tag.
 * Returns null on 404. Throws on other HTTP or network errors.
 */
export async function getLatestVersion(packageName: string): Promise<string | null> {
  let encoded = encodeURIComponent(packageName);
  if (packageName.startsWith("@")) {
    encoded = "@" + encodeURIComponent(packageName.slice(1));
  }
  const url = `https://registry.npmjs.org/${encoded}/latest`;

  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  if (res.status === 404) {
    return null;
  }

  if (!res.ok) {
    throw new Error(`Failed to fetch package metadata for ${packageName}: HTTP ${res.status}`);
  }

  const data = await res.json();
  const latest = data.version;
  return latest || null;
}

/**
 * Resolves a package.json range into a concrete baseline version.
 *
 * package.json ranges are far looser than full semver versions. "^20",
 * "~5", ">=1.2 <2", and "18 || 19" are all legal and all rejected by
 * semver.valid(), so parsing must go through the range machinery instead.
 *
 * Order matters:
 *   1. semver.valid   — exact pins like "19.2.4", cheapest path.
 *   2. semver.minVersion — the lowest version a range admits. "^20" -> 20.0.0.
 *      This is the correct baseline: it is the oldest version the repo may
 *      currently be running, so an upgrade past it is genuinely breaking.
 *   3. semver.coerce  — last resort for oddities minVersion rejects.
 *
 * Returns null for ranges with no semver meaning ("workspace:*", "file:../x",
 * git URLs). Callers must treat null as "unknown", never as "up to date".
 */
export function parseDeclaredVersion(declaredRange: string): string | null {
  const trimmed = declaredRange.trim();
  if (!trimmed) return null;

  // A range that admits any version carries no baseline. semver.minVersion maps
  // "*" and "x" to 0.0.0, which then reads as "this repo runs 0.0.0" and makes
  // every such package look like it needs a major upgrade — producing a
  // candidate whose PR would cite a jump from a version never installed.
  // Matches "*", "x", "X", "x.x", "*.*"; not "1.x", which has a real major.
  if (/^[*xX\s.]+$/.test(trimmed)) return null;

  // "npm:other-pkg@^1.0.0" aliases a different package. The version is real but
  // belongs to other-pkg, while callers only hold the alias name to query the
  // registry with, so any comparison would be against the wrong package.
  if (trimmed.startsWith("npm:")) return null;

  const exact = semver.valid(trimmed.replace(/^[~^v\s]+/, ""));
  if (exact) return exact;

  try {
    const min = semver.minVersion(trimmed);
    if (min) return min.version;
  } catch {
    // Invalid range — fall through to coerce.
  }

  return semver.coerce(trimmed)?.version ?? null;
}

/**
 * Checks if there is a newer version of the package.
 * If yes, checks if it is a major upgrade.
 *
 * Returns null when no newer version exists OR when the declared range has no
 * semver meaning. Callers that need to tell those apart should call
 * parseDeclaredVersion() first — a null there means "unknown", and reporting
 * such a dependency as up to date would be a false negative.
 */
export async function findMajorUpgrade(
  packageName: string,
  currentVersion: string
): Promise<{ from: string; to: string; isMajor: boolean } | null> {
  const parsedCurrent = parseDeclaredVersion(currentVersion);
  if (!parsedCurrent) {
    return null;
  }

  const latest = await getLatestVersion(packageName);
  if (!latest) {
    return null;
  }

  const parsedLatest = semver.valid(latest);
  if (!parsedLatest) {
    return null;
  }

  // If latest is not greater than current, return null
  if (!semver.gt(parsedLatest, parsedCurrent)) {
    return null;
  }

  const currentMajor = semver.major(parsedCurrent);
  const latestMajor = semver.major(parsedLatest);
  const isMajor = latestMajor > currentMajor;

  return {
    from: parsedCurrent,
    to: parsedLatest,
    isMajor,
  };
}
