import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");

/**
 * @param {string} message
 */
function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exitCode = 1;
}

/**
 * @param {string} message
 */
function ok(message) {
  console.log(`OK: ${message}`);
}

/**
 * @param {string} version
 * @returns {{ major: number, minor: number, patch: number } | null}
 */
function parseSemver(version) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version.trim());
  if (!match) {
    return null;
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

/**
 * @param {{ major: number, minor: number, patch: number }} version
 * @param {{ major: number, minor: number, patch: number }} minimum
 */
function isAtLeast(version, minimum) {
  if (version.major !== minimum.major) {
    return version.major > minimum.major;
  }
  if (version.minor !== minimum.minor) {
    return version.minor > minimum.minor;
  }
  return version.patch >= minimum.patch;
}

function readPackageJson() {
  const packageJsonPath = join(rootDir, "package.json");
  if (!existsSync(packageJsonPath)) {
    fail(`Missing root package.json at ${packageJsonPath}`);
    return null;
  }

  try {
    return JSON.parse(readFileSync(packageJsonPath, "utf8"));
  } catch {
    fail("Root package.json could not be parsed as JSON.");
    return null;
  }
}

/**
 * @param {unknown} packageJson
 */
function expectedPnpmVersion(packageJson) {
  if (!packageJson || typeof packageJson !== "object") {
    return null;
  }

  const packageManager =
    "packageManager" in packageJson && typeof packageJson.packageManager === "string"
      ? packageJson.packageManager
      : null;

  if (!packageManager) {
    fail('Root package.json is missing a "packageManager" field (expected pnpm@x.y.z).');
    return null;
  }

  const match = /^pnpm@(\d+\.\d+\.\d+)/.exec(packageManager);
  if (!match) {
    fail(`Unsupported packageManager value "${packageManager}". Expected pnpm@x.y.z.`);
    return null;
  }

  return match[1];
}

/**
 * @param {unknown} packageJson
 */
function expectedNodeRange(packageJson) {
  if (!packageJson || typeof packageJson !== "object") {
    return null;
  }

  const engines =
    "engines" in packageJson && packageJson.engines && typeof packageJson.engines === "object"
      ? packageJson.engines
      : null;

  if (!engines || !("node" in engines) || typeof engines.node !== "string") {
    fail('Root package.json is missing engines.node (expected ">=x.y.z <N").');
    return null;
  }

  return engines.node;
}

/**
 * Validates engines.node of the form ">=X.Y.Z <N".
 * @param {string} range
 * @param {string} currentVersion
 */
function checkNodeVersion(range, currentVersion) {
  const parsedCurrent = parseSemver(currentVersion);
  if (!parsedCurrent) {
    fail(`Could not parse the running Node.js version "${currentVersion}".`);
    return;
  }

  const rangeMatch = /^>=(\d+\.\d+\.\d+)\s+<(\d+)$/.exec(range.trim());
  if (!rangeMatch) {
    fail(
      `Unsupported engines.node range "${range}". Use the form ">=X.Y.Z <N" so this script can validate it.`,
    );
    return;
  }

  const minimum = parseSemver(rangeMatch[1]);
  const maxMajor = Number(rangeMatch[2]);
  if (!minimum) {
    fail(`Could not parse the minimum Node.js version from engines.node "${range}".`);
    return;
  }

  if (parsedCurrent.major >= maxMajor) {
    fail(
      `Node.js ${currentVersion} is outside the supported range ${range}. Install Node.js ${minimum.major}.x LTS (see .node-version).`,
    );
    return;
  }

  if (!isAtLeast(parsedCurrent, minimum)) {
    fail(
      `Node.js ${currentVersion} is below the required minimum ${rangeMatch[1]}. Install Node.js ${minimum.major}.x LTS (see .node-version).`,
    );
    return;
  }

  ok(`Node.js ${currentVersion} satisfies engines.node ${range}`);
}

/**
 * @param {string} expectedVersion
 */
/**
 * @returns {string | null}
 */
function detectPnpmVersion() {
  const userAgent = process.env.npm_config_user_agent;
  if (typeof userAgent === "string") {
    const fromAgent = /pnpm\/(\d+\.\d+\.\d+)/.exec(userAgent);
    if (fromAgent) {
      return fromAgent[1];
    }
  }

  const result =
    process.platform === "win32"
      ? spawnSync("cmd.exe", ["/d", "/s", "/c", "pnpm --version"], { encoding: "utf8" })
      : spawnSync("pnpm", ["--version"], { encoding: "utf8" });

  if (result.error || result.status !== 0) {
    return null;
  }

  return (result.stdout || "").trim() || null;
}

/**
 * @param {string} expectedVersion
 */
function checkPnpmVersion(expectedVersion) {
  const actual = detectPnpmVersion();

  if (!actual) {
    fail(
      `pnpm is not available. Enable Corepack and install pnpm@${expectedVersion} (for example: corepack enable && corepack prepare pnpm@${expectedVersion} --activate).`,
    );
    return;
  }

  const parsedActual = parseSemver(actual);
  const parsedExpected = parseSemver(expectedVersion);

  if (!parsedActual || !parsedExpected) {
    fail(`Could not compare pnpm versions (running: "${actual}", expected: "${expectedVersion}").`);
    return;
  }

  if (
    parsedActual.major !== parsedExpected.major ||
    parsedActual.minor !== parsedExpected.minor ||
    parsedActual.patch !== parsedExpected.patch
  ) {
    fail(
      `pnpm ${actual} does not match the repository packageManager pin pnpm@${expectedVersion}. Run: corepack prepare pnpm@${expectedVersion} --activate`,
    );
    return;
  }

  ok(`pnpm ${actual} matches packageManager pnpm@${expectedVersion}`);
}

function checkWorkspaceFiles() {
  const workspacePath = join(rootDir, "pnpm-workspace.yaml");
  if (!existsSync(workspacePath)) {
    fail(`Missing pnpm-workspace.yaml at ${workspacePath}`);
    return;
  }

  ok("pnpm-workspace.yaml is present");
  ok("root package.json is present");
}

const packageJson = readPackageJson();
const nodeRange = expectedNodeRange(packageJson);
const pnpmVersion = expectedPnpmVersion(packageJson);

if (nodeRange) {
  checkNodeVersion(nodeRange, process.versions.node);
}

if (pnpmVersion) {
  checkPnpmVersion(pnpmVersion);
}

checkWorkspaceFiles();

if (process.exitCode) {
  console.error(
    "Development environment checks failed. Fix the errors above and re-run pnpm doctor.",
  );
  process.exit(process.exitCode);
}

console.log("All development environment checks passed.");
