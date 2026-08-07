/**
 * lib/registry/release-notes.ts
 *
 * Fetches human-written breaking-change notes for a package version jump.
 *
 * This is the piece that makes upgrade patches possible. Knowing "typescript
 * 5 → 7" tells us nothing about what to change; the release notes do. Without
 * this, the AI would be guessing from the version numbers alone, which is how
 * you get confident, wrong patches.
 *
 * Strategy (npm registry has no release-notes field, so we go via the repo):
 *   1. Read the package's `repository` field from the registry.
 *   2. If it points at GitHub, list releases and keep those whose tag falls in
 *      (fromVersion, toVersion].
 *   3. Return the notes verbatim. We do NOT summarise here — the AI needs the
 *      raw text, and summarising early loses the migration snippets that make
 *      a patch correct.
 *
 * Deliberate limits:
 *  - GitHub only. GitLab/Bitbucket/self-hosted return null rather than a
 *    half-working guess.
 *  - Unauthenticated GitHub reads (60 req/hr/IP) unless GITHUB_TOKEN is set.
 *    Callers scanning many packages should set it.
 *  - Returns null, never throws, for "no notes found". A missing changelog is
 *    normal and must not fail a scan. Callers must treat null as "unknown",
 *    not as "no breaking changes".
 */

import semver from "semver";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Releases listed per package. Covers a multi-major jump without paginating. */
const MAX_RELEASES_FETCHED = 100;

/**
 * Cap on total note characters returned. Some projects ship enormous release
 * bodies; a multi-major jump can produce hundreds of KB, which would blow the
 * AI context and cost far more than the patch is worth.
 */
const MAX_NOTES_CHARS = 24_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReleaseNote {
  /** The version this note describes, normalised (e.g. "7.0.0"). */
  version: string;
  /** Release title as written by the maintainer. */
  title: string;
  /** Raw markdown body. May be empty if the maintainer wrote none. */
  body: string;
  /** Link back to the release, used for breaking_source_url. */
  url: string;
  /** True if this release crosses a major boundary from the previous one. */
  isMajor: boolean;
}

export interface ReleaseNotesResult {
  packageName: string;
  fromVersion: string;
  toVersion: string;
  /** Notes ordered oldest → newest, so migrations read in the order to apply. */
  notes: ReleaseNote[];
  /** The GitHub repo we read from, e.g. "microsoft/TypeScript". */
  sourceRepo: string | null;
  /** True if notes were dropped to stay under MAX_NOTES_CHARS. */
  truncated: boolean;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/**
 * Extracts "owner/repo" from the many shapes npm's `repository` field takes:
 *   "user/repo"                          (shorthand)
 *   "github:user/repo"
 *   "https://github.com/user/repo.git"
 *   "git+ssh://git@github.com/user/repo.git"
 *   { type: "git", url: "..." }
 *
 * Returns null for non-GitHub hosts.
 */
export function parseGitHubRepo(repository: unknown): string | null {
  const raw =
    typeof repository === "string"
      ? repository
      : repository && typeof repository === "object" && "url" in repository
        ? String((repository as { url: unknown }).url)
        : null;

  if (!raw) return null;

  // Bare "user/repo" shorthand — no host, so it means GitHub by npm convention.
  if (/^[\w.-]+\/[\w.-]+$/.test(raw)) {
    return raw.replace(/\.git$/, "");
  }

  const match = raw.match(/github(?:\.com)?[:/]+([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:[#/?].*)?$/i);
  if (!match) return null;

  return `${match[1]}/${match[2]}`;
}

/** Reads the `repository` field from the registry's packument metadata. */
async function fetchRepositoryField(packageName: string): Promise<unknown | null> {
  let encoded = encodeURIComponent(packageName);
  if (packageName.startsWith("@")) {
    encoded = "@" + encodeURIComponent(packageName.slice(1));
  }

  // The /latest endpoint carries `repository` and is far smaller than the
  // full packument, which lists every version ever published.
  const res = await fetch(`https://registry.npmjs.org/${encoded}/latest`, {
    headers: { Accept: "application/json" },
  });

  if (!res.ok) return null;

  const data = (await res.json()) as { repository?: unknown };
  return data.repository ?? null;
}

interface GitHubRelease {
  tag_name: string;
  name: string | null;
  body: string | null;
  html_url: string;
  draft: boolean;
  prerelease: boolean;
}

async function fetchGitHubReleases(repoSlug: string): Promise<GitHubRelease[]> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  // Optional: lifts the unauthenticated 60 req/hr limit to 5000.
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(
    `https://api.github.com/repos/${repoSlug}/releases?per_page=${MAX_RELEASES_FETCHED}`,
    { headers },
  );

  if (!res.ok) {
    console.warn(`[release-notes] GitHub releases fetch failed for ${repoSlug}: HTTP ${res.status}`);
    return [];
  }

  return (await res.json()) as GitHubRelease[];
}

/** Candidate changelog filenames, in the order projects most commonly use. */
const CHANGELOG_PATHS = [
  "CHANGELOG.md",
  "CHANGELOG.markdown",
  "changelog.md",
  "docs/CHANGELOG.md",
  "History.md",
];

/**
 * Falls back to the repo's CHANGELOG.md when GitHub releases carry no usable
 * text. TypeScript is the motivating case: every release body is just "see the
 * release announcement" plus a link, so releases alone yield nothing.
 *
 * Trimmed from the top — changelogs are conventionally newest-first, so the
 * head of the file covers the target version.
 */
async function fetchChangelogFile(
  repoSlug: string,
): Promise<{ body: string; url: string } | null> {
  for (const path of CHANGELOG_PATHS) {
    const res = await fetch(`https://raw.githubusercontent.com/${repoSlug}/HEAD/${path}`, {
      headers: { Accept: "text/plain" },
    });

    if (!res.ok) continue;

    const body = await res.text();
    if (body.replace(/\s+/g, "").length < 40) continue;

    console.log(`[release-notes] Using ${path} from ${repoSlug}`);
    return {
      body: body.slice(0, MAX_NOTES_CHARS),
      url: `https://github.com/${repoSlug}/blob/HEAD/${path}`,
    };
  }

  return null;
}

/**
 * Pulls a semver version out of a release tag. Tags are wildly inconsistent:
 * "v5.0.0", "5.0.0", "typescript@5.0.0", "release-5.0.0".
 */
function versionFromTag(tag: string): string | null {
  return semver.valid(tag.replace(/^[^\d]*/, "")) ?? semver.coerce(tag)?.version ?? null;
}

/**
 * True if a release body contains actual migration text, as opposed to a
 * pointer at where the notes really live.
 *
 * A length threshold alone does not work. TypeScript's bodies read "For release
 * notes, check out the [release announcement](https://devblogs...)." — over 100
 * characters, comfortably past any sane minimum, and worth nothing to a patch
 * generator. Feeding those through means the AI sees no breaking changes and
 * confidently reports none, which is worse than admitting we do not know.
 *
 * Two checks:
 *  1. Strip URLs and markdown link syntax; require real prose to remain.
 *  2. Reject bodies that are a single short sentence pointing elsewhere.
 */
export function hasUsableContent(body: string): boolean {
  if (!body) return false;

  // Drop markdown links entirely — "[text](url)" is a pointer, not content.
  const withoutLinks = body
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "")
    .replace(/https?:\/\/\S+/g, "");

  const dense = withoutLinks.replace(/\s+/g, "");
  if (dense.length < 40) return false;

  // "See the release notes", "check out the announcement", "full changelog at"
  // are all redirects. If the remaining prose is short AND matches one of
  // these, treat it as a pointer regardless of length.
  const REDIRECT = /\b(release notes|announcement|changelog|full diff|see (the|our)|check out)\b/i;
  if (dense.length < 200 && REDIRECT.test(withoutLinks)) return false;

  return true;
}

/**
 * Wraps a CHANGELOG.md read into the same shape as release-derived notes.
 *
 * The whole file is returned as one synthetic note tagged with the target
 * version. We do NOT try to slice out the relevant version sections: changelog
 * heading formats vary too much ("## 7.0.0", "# [7.0.0]", "## v7.0.0 (2026-01-02)")
 * and a wrong slice would silently drop the breaking-change section. Handing
 * the AI the whole head of the file and telling it the version range is more
 * robust than parsing we cannot verify.
 *
 * `truncated: true` always, since the file is cut to budget and callers should
 * know they are not seeing everything.
 */
async function changelogFallback(
  packageName: string,
  from: string,
  to: string,
  sourceRepo: string,
): Promise<ReleaseNotesResult | null> {
  const changelog = await fetchChangelogFile(sourceRepo);

  if (!changelog) {
    console.log(`[release-notes] No CHANGELOG found for ${packageName} — giving up`);
    return null;
  }

  return {
    packageName,
    fromVersion: from,
    toVersion: to,
    notes: [
      {
        version: to,
        title: `CHANGELOG.md (${from} → ${to})`,
        body: changelog.body,
        url: changelog.url,
        isMajor: semver.major(to) > semver.major(from),
      },
    ],
    sourceRepo,
    truncated: true,
  };
}

async function compareTagsFallback(
  packageName: string,
  from: string,
  to: string,
  sourceRepo: string,
  releases: GitHubRelease[] = [],
): Promise<ReleaseNotesResult | null> {
  const fromTag = releases.find((r) => versionFromTag(r.tag_name) === from)?.tag_name ?? `v${from}`;
  const toTag = releases.find((r) => versionFromTag(r.tag_name) === to)?.tag_name ?? `v${to}`;
  const compareUrl = `https://github.com/${sourceRepo}/compare/${fromTag}...${toTag}`;

  try {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "api-sentinel",
    };
    if (process.env.GITHUB_TOKEN) {
      headers["Authorization"] = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    const res = await fetch(`https://api.github.com/repos/${sourceRepo}/compare/${fromTag}...${toTag}`, {
      headers,
    });

    if (!res.ok) {
      console.warn(`[release-notes] GitHub compare API returned status ${res.status} for ${sourceRepo}`);
      return null;
    }

    const data = await res.json() as {
      commits?: Array<{ commit: { message: string } }>;
      files?: Array<{ filename: string; status: string; additions: number; deletions: number }>;
    };

    const commits = data.commits ?? [];
    const files = data.files ?? [];

    if (commits.length === 0 && files.length === 0) {
      console.warn(`[release-notes] GitHub compare returned empty result for ${sourceRepo}`);
      return null;
    }

    // Summarize changes
    let summary = `GitHub Comparison Diff summary (${from} → ${to}):\n`;
    summary += `Compare URL: ${compareUrl}\n\n`;

    if (commits.length > 0) {
      summary += `### Commits:\n`;
      for (const c of commits.slice(0, 20)) { // limit to 20 commits
        const msg = c.commit.message.split("\n")[0];
        summary += `- ${msg}\n`;
      }
      if (commits.length > 20) {
        summary += `- ... and ${commits.length - 20} more commits\n`;
      }
      summary += `\n`;
    }

    if (files.length > 0) {
      summary += `### Changed Files:\n`;
      for (const f of files.slice(0, 15)) { // limit to 15 files
        summary += `- ${f.filename} (${f.status}: +${f.additions} -${f.deletions})\n`;
      }
      if (files.length > 15) {
        summary += `- ... and ${files.length - 15} more files\n`;
      }
    }

    return {
      packageName,
      fromVersion: from,
      toVersion: to,
      notes: [
        {
          version: to,
          title: `GitHub Compare (${from} → ${to})`,
          body: summary,
          url: compareUrl,
          isMajor: semver.major(to) > semver.major(from),
        },
      ],
      sourceRepo,
      truncated: false,
    };
  } catch (err: any) {
    console.warn(`[release-notes] Failed to fetch compare diff for ${sourceRepo}:`, err.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetches release notes for versions in the range (fromVersion, toVersion].
 *
 * `fromVersion` is exclusive: the user already runs it, so its notes describe
 * changes they have absorbed. `toVersion` is inclusive: that release is the
 * upgrade target.
 *
 * Returns null when no source of notes could be found — an unknown, which the
 * caller must not report to the user as "no breaking changes".
 */
export async function fetchReleaseNotes(
  packageName: string,
  fromVersion: string,
  toVersion: string,
): Promise<ReleaseNotesResult | null> {
  const from = semver.valid(fromVersion) ?? semver.coerce(fromVersion)?.version;
  const to = semver.valid(toVersion) ?? semver.coerce(toVersion)?.version;

  if (!from || !to) {
    console.warn(
      `[release-notes] Unparseable version range for ${packageName}: ${fromVersion} → ${toVersion}`,
    );
    return null;
  }

  if (packageName.startsWith("@types/")) {
    console.log(`[release-notes] Skipping DefinitelyTyped package: ${packageName}`);
    return null;
  }

  const repository = await fetchRepositoryField(packageName);
  const sourceRepo = parseGitHubRepo(repository);

  if (!sourceRepo) {
    console.log(`[release-notes] No GitHub repo found for ${packageName}`);
    return null;
  }

  console.log(
    `[release-notes] Reading ${sourceRepo} releases for ${packageName} ${from} → ${to} ...`,
  );

  const releases = await fetchGitHubReleases(sourceRepo);

  const inRange = releases
    .filter((r) => !r.draft && !r.prerelease)
    .map((r) => ({ release: r, version: versionFromTag(r.tag_name) }))
    .filter(
      (x): x is { release: GitHubRelease; version: string } =>
        x.version !== null && semver.gt(x.version, from) && semver.lte(x.version, to),
    )
    .sort((a, b) => semver.compare(a.version, b.version));

  if (inRange.length === 0) {
    console.log(`[release-notes] No releases in range for ${packageName}, trying CHANGELOG ...`);
    const fallback = await changelogFallback(packageName, from, to, sourceRepo);
    if (fallback) return fallback;
    console.log(`[release-notes] No CHANGELOG found for ${packageName}, using compare link ...`);
    return await compareTagsFallback(packageName, from, to, sourceRepo, releases);
  }

  const fromMajor = semver.major(from);

  // Budget priority is major releases first, oldest → newest.
  //
  // A naive newest-first fill is actively harmful: for eslint 9 → 10 it kept
  // 10.5–10.8 ("## Features") and dropped 10.0.0, the one release that
  // documents what breaks. The AI would then see a feature list, conclude
  // nothing breaks, and emit a confident wrong patch.
  //
  // x.0.0 releases carry the migration guides, so they are never displaced by
  // minors. Among majors, oldest first: crossing 9 → 10 → 11 means applying
  // 10.0.0's migration before 11.0.0's.
  const isMajorRelease = (v: string) =>
    semver.major(v) > fromMajor && semver.minor(v) === 0 && semver.patch(v) === 0;

  const majors = inRange.filter((x) => isMajorRelease(x.version));
  // Minors newest-first: closest to the target version is most relevant.
  const minors = inRange.filter((x) => !isMajorRelease(x.version)).reverse();

  const picked = new Map<string, ReleaseNote>();
  let charBudget = MAX_NOTES_CHARS;
  let truncated = false;

  for (const { release, version } of [...majors, ...minors]) {
    const body = release.body ?? "";

    // Skip notes that carry no migration text, rather than spending budget on
    // them and starving the releases that do.
    if (!hasUsableContent(body)) continue;

    if (body.length > charBudget) {
      truncated = true;
      continue; // a later, smaller note may still fit
    }
    charBudget -= body.length;

    picked.set(version, {
      version,
      title: release.name ?? release.tag_name,
      body,
      url: release.html_url,
      isMajor: semver.major(version) > fromMajor,
    });
  }

  // Emit in version order — migrations must read in the order they apply.
  const notes = [...picked.values()].sort((a, b) => semver.compare(a.version, b.version));

  if (notes.length === 0) {
    // Releases existed but every body was empty, link-only, or oversized.
    // TypeScript hits this: 25 releases, all "see the release announcement".
    console.log(
      `[release-notes] ${packageName}: ${inRange.length} release(s) but no usable text, trying CHANGELOG ...`,
    );
    const fallback = await changelogFallback(packageName, from, to, sourceRepo);
    if (fallback) return fallback;
    console.log(`[release-notes] No CHANGELOG found for ${packageName}, using compare link ...`);
    return await compareTagsFallback(packageName, from, to, sourceRepo, releases);
  }

  const majorsIncluded = notes.filter((n) => n.isMajor).length;
  console.log(
    `[release-notes] ${packageName}: ${notes.length} release(s), ` +
      `${majorsIncluded} major${truncated ? " (some notes dropped for size)" : ""}`,
  );

  return { packageName, fromVersion: from, toVersion: to, notes, sourceRepo, truncated };
}
