/**
 * Every Tauri plugin's Rust crate and its npm package must agree on
 * major.minor.
 *
 * `tauri build` refuses to run when they do not, and it is the only thing that
 * checks — so the mismatch used to pass CI and fail the release, on all three
 * platforms at once, after the frontend had already built. That happened:
 * `tauri-plugin-updater` resolved to 2.11.0 in Cargo.lock while the npm package
 * was pinned at 2.9.0.
 *
 * The versions drift because the two sides are pinned differently. Cargo.toml
 * asks for `"2"` and the lockfile decides; package.json pins exactly. Nothing
 * makes them move together, so something has to notice when they have not.
 *
 *   node scripts/check-plugin-versions.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const lock = readFileSync(fileURLToPath(new URL("src-tauri/Cargo.lock", root)), "utf8");
const pkg = JSON.parse(readFileSync(fileURLToPath(new URL("package.json", root)), "utf8"));

/** Every `[[package]]` block's name and version. */
const crates = new Map();
for (const block of lock.split("[[package]]")) {
  const name = block.match(/^name = "(.+)"$/m)?.[1];
  const version = block.match(/^version = "(.+)"$/m)?.[1];
  if (name && version) crates.set(name, version);
}

const minor = (version) => version.split(".").slice(0, 2).join(".");

const problems = [];
for (const [npmName, npmVersion] of Object.entries(pkg.dependencies ?? {})) {
  // `@tauri-apps/api` pairs with the `tauri` crate; the plugins pair by name.
  const crateName =
    npmName === "@tauri-apps/api"
      ? "tauri"
      : npmName.startsWith("@tauri-apps/plugin-")
        ? `tauri-plugin-${npmName.slice("@tauri-apps/plugin-".length)}`
        : null;
  if (!crateName) continue;

  const crateVersion = crates.get(crateName);
  if (!crateVersion) {
    // A JS plugin with no Rust half is a plugin that will not work, and the
    // failure would be at runtime in the window rather than at build time.
    problems.push(`${npmName} ${npmVersion} has no ${crateName} in Cargo.lock`);
    continue;
  }
  if (minor(crateVersion) !== minor(npmVersion)) {
    problems.push(
      `${crateName} ${crateVersion} (Rust) vs ${npmName} ${npmVersion} (npm)` +
        ` — tauri build refuses this`,
    );
  }
}

if (problems.length > 0) {
  console.error("Tauri package versions disagree:");
  for (const problem of problems) console.error(`  ${problem}`);
  console.error("\nFix by matching the npm pin to what Cargo.lock resolved:");
  console.error("  yarn add --exact @tauri-apps/plugin-<name>@<rust major.minor.patch>");
  process.exit(1);
}

console.log(`Tauri package versions agree (${crates.get("tauri")}).`);
