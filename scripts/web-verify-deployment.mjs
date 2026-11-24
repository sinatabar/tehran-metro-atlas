import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { setTimeout as wait } from "node:timers/promises";

const origin = new URL(
  process.argv[2] || "https://sinatabar.github.io/tehran-metro-atlas/",
);
const local = await readFile("data/published/atlas.json");
const atlas = JSON.parse(local);
const release = JSON.parse(
  await readFile("data/published/checksums.json", "utf8"),
);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const stamp = process.env.GITHUB_SHA || hash(local).slice(0, 12);
async function get(resource) {
  const url = new URL(resource, origin);
  url.searchParams.set("release-check", stamp);
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw Error(resource + " returned " + response.status);
  return Buffer.from(await response.arrayBuffer());
}
async function verify() {
  const [home, station, sitemap, db] = await Promise.all([
    get(""),
    get(
      "en/stations/" +
        atlas.stations.find((s) => s.status === "operational").id +
        "/",
    ),
    get("sitemap.xml"),
    get("data/atlas.json"),
  ]);
  if (
    !home.includes('dir="rtl"') ||
    !station.includes("TrainStation") ||
    !sitemap.includes(new URL("en/lines/line-10/", origin).href)
  )
    throw Error(
      "A public bilingual route or sitemap is missing its release content",
    );
  if (!db.equals(local))
    throw Error("The live database differs from the reviewed release");
  for (const [p, digest] of Object.entries(release.sha256)) {
    const resource = p.replace(/^data\/published\//, "data/");
    if (hash(await get(resource)) !== digest)
      throw Error("Checksum mismatch at " + resource);
  }
  console.log(
    "Confirmed public Persian homepage, English station page, future-line sitemap entry and " +
      Object.keys(release.sha256).length +
      " dataset checksums for " +
      atlas.version,
  );
}
for (let attempt = 1; attempt <= 6; attempt++) {
  try {
    await verify();
    break;
  } catch (error) {
    if (attempt === 6) throw error;
    console.log(error.message);
    await wait(10000);
  }
}
