import { readFileSync } from "fs";
import { execSync } from "child_process";

const REQUIRED_VARS = [
  "GITHUB_APP_ID",
  "GITHUB_APP_PRIVATE_KEY",
  "GITHUB_WEBHOOK_SECRET",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "GOOGLE_AI_API_KEY",
  "CRON_SECRET",
];

async function main() {
  console.log("Reading .env.local...");
  const envContent = readFileSync(".env.local", "utf8");

  // Simple env parser
  const env: Record<string, string> = {};
  const lines = envContent.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const firstEq = trimmed.indexOf("=");
    if (firstEq === -1) continue;
    const key = trimmed.slice(0, firstEq).trim();
    let value = trimmed.slice(firstEq + 1).trim();

    // Remove quotes if present
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    } else if (value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }

  console.log("Setting environment variables on Vercel...");
  for (const key of REQUIRED_VARS) {
    const val = env[key];
    if (val === undefined) {
      console.error(`Error: ${key} is not set in .env.local`);
      process.exit(1);
    }
    console.log(`Setting ${key}...`);

    // Run vercel env add using execSync. We pass the value safely by piping it into stdin or using --value.
    // To handle special characters (especially GITHUB_APP_PRIVATE_KEY containing \n), we use stdin to prevent shell interpolation.
    const proc = execSync(`vercel env add ${key} production --force --yes`, {
      input: val,
      encoding: "utf8",
    });
    console.log(`Response for ${key}:`, proc.trim());
  }

  console.log("\nAll requested environment variables have been set successfully on Vercel.");
}

main().catch(console.error);
