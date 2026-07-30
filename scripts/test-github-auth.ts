/**
 * Manual test for lib/github/app-auth.ts
 *
 * Prerequisites:
 *   1. Copy .env.local.example → .env.local and fill in:
 *      GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY
 *   2. Install the GitHub App on at least one repo and note the installation ID
 *      (GitHub App settings → Installations → click the install → URL ends in /<id>)
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/test-github-auth.ts <installation_id>
 *
 * Expected output:
 *   ✓ Token obtained: ghs_XXXX... (N chars)
 *   ✓ Token is valid. Repos accessible to this installation:
 *     - owner/repo-name (id: 12345678)
 */

import { getInstallationToken, getInstallationOctokit } from "../lib/github/app-auth";

async function main(): Promise<void> {
  const installationId = Number(process.argv[2]);

  if (!installationId || isNaN(installationId)) {
    console.error(
      "Usage: npx tsx --env-file=.env.local scripts/test-github-auth.ts <installation_id>",
    );
    process.exit(1);
  }

  console.log(`\nApp ID        : ${process.env.GITHUB_APP_ID}`);
  console.log(`Installation  : ${installationId}\n`);

  // Step 1 — obtain token
  console.log("Step 1: Fetching installation access token...");
  const token = await getInstallationToken(installationId);
  // Never log full tokens — show prefix only
  console.log(`✓ Token obtained: ${token.slice(0, 8)}... (${token.length} chars total)\n`);

  // Step 2 — verify token by listing accessible repos
  console.log("Step 2: Listing repos accessible to this installation...");
  const octokit = await getInstallationOctokit(installationId);
  const { data } = await octokit.apps.listReposAccessibleToInstallation({ per_page: 10 });

  if (data.repositories.length === 0) {
    console.log("⚠ Token valid, but no repos are accessible. Check the installation scope.");
  } else {
    console.log(`✓ Token is valid. ${data.total_count} repo(s) accessible:\n`);
    for (const repo of data.repositories) {
      console.log(`  • ${repo.full_name.padEnd(50)} (github_repo_id: ${repo.id})`);
    }
    console.log(
      "\n💡 Copy a github_repo_id above — you'll need it when testing the webhook handler (Piece 4).",
    );
  }
}

main().catch((err: Error) => {
  console.error("\n✗ Error:", err.message);
  if (err.message.includes("401")) {
    console.error(
      "  → Check that GITHUB_APP_PRIVATE_KEY matches the key downloaded from your App settings.",
    );
  }
  if (err.message.includes("404")) {
    console.error(
      "  → Installation ID not found. Confirm the App is installed and the ID is correct.",
    );
  }
  process.exit(1);
});
