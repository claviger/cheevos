// One-time setup: download a curated set of icons from game-icons.net (CC BY 3.0)
// into public/icons/. Each raw SVG ships with an opaque full-canvas background
// rect plus a white icon path; we strip the background so the result is a clean
// transparent silhouette that recolors via CSS `mask` + currentColor.
//
// Run:  npm run fetch-icons
//
// Network is required. Any icon that fails to download is skipped with a warning;
// the committed coin.svg / placeholder.svg fallbacks keep the app usable offline.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outDir = path.join(root, "public", "icons");
const RAW = "https://raw.githubusercontent.com/game-icons/icons/master";

// slug (local filename) -> author/path within the game-icons repo. Verified 200.
const MANIFEST = {
  // fantasy / general
  coins: "delapouite/coins.svg",
  "two-coins": "delapouite/two-coins.svg",
  trophy: "lorc/trophy.svg",
  sword: "lorc/broadsword.svg",
  shield: "sbed/shield.svg",
  "checked-shield": "lorc/checked-shield.svg",
  gem: "lorc/gems.svg",
  diamond: "lorc/cut-diamond.svg",
  emerald: "lorc/emerald.svg",
  scroll: "lorc/scroll-unfurled.svg",
  potion: "lorc/potion-ball.svg",
  dragon: "lorc/dragon-head.svg",
  star: "delapouite/round-star.svg",
  crown: "lorc/crown.svg",
  key: "lorc/key.svg",
  chest: "delapouite/chest.svg",
  "locked-chest": "lorc/locked-chest.svg",
  laurels: "lorc/laurels.svg",
  medal: "delapouite/star-medal.svg",
  sparkles: "delapouite/sparkles.svg",
  "magic-swirl": "lorc/magic-swirl.svg",
  // chores
  tooth: "lorc/tooth.svg",
  broom: "delapouite/broom.svg",
  bed: "delapouite/bed.svg",
  book: "delapouite/book-cover.svg",
  plant: "delapouite/plant-watering.svg",
  sprout: "lorc/sprout.svg",
  meal: "delapouite/meal.svg",
  "hot-meal": "delapouite/hot-meal.svg",
  trash: "delapouite/trash-can.svg",
  laundry: "delapouite/washing-machine.svg",
  // kid rewards
  "ice-cream": "delapouite/ice-cream-cone.svg",
  cupcake: "delapouite/cupcake.svg",
  gamepad: "delapouite/gamepad.svg",
  "game-console": "delapouite/game-console.svg",
  joystick: "delapouite/joystick.svg",
  music: "delapouite/musical-notes.svg",
  movie: "delapouite/clapperboard.svg",
  soccer: "delapouite/soccer-ball.svg",
  bowling: "delapouite/bowling-pin.svg",
};

// Remove the opaque full-canvas background rect and normalize the icon fill to
// currentColor so it works both as an <img> and as a CSS mask.
function cleanSvg(svg) {
  return svg
    .replace(/<path d="M0 0h512v512H0z"[^>]*\/>/, "")
    .replace(/fill="#fff"/g, 'fill="currentColor"');
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const slugs = Object.keys(MANIFEST);
  let ok = 0;
  const failed = [];

  for (const slug of slugs) {
    const url = `${RAW}/${MANIFEST[slug]}`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const svg = cleanSvg(await res.text());
      fs.writeFileSync(path.join(outDir, `${slug}.svg`), svg, "utf8");
      ok++;
      process.stdout.write(`  ✓ ${slug}\n`);
    } catch (err) {
      failed.push(slug);
      process.stdout.write(`  ✗ ${slug} (${err.message})\n`);
    }
  }

  console.log(`\nDownloaded ${ok}/${slugs.length} icons into public/icons/`);
  if (failed.length) console.log(`Failed: ${failed.join(", ")}`);
  writeAttribution(slugs.filter((s) => !failed.includes(s)));
}

function writeAttribution(slugs) {
  const lines = slugs.map((s) => `- ${s}: ${MANIFEST[s]}`).join("\n");
  const content = `# Icon Attribution

The icons in \`public/icons/\` (except the hand-made \`coin.svg\` and
\`placeholder.svg\`) are from **game-icons.net**, licensed **CC BY 3.0**
(https://creativecommons.org/licenses/by/3.0/). Primary authors: Lorc, Delapouite,
and contributors (see https://game-icons.net).

Icons used (local-slug: source-path within the game-icons repo):

${lines}
`;
  fs.writeFileSync(path.join(root, "ATTRIBUTION.md"), content, "utf8");
  console.log("Wrote ATTRIBUTION.md");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
