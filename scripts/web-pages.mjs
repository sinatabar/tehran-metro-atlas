import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";

const out = "dist",
  base = process.env.BASE_PATH || "/";
const site = new URL(
  base,
  process.env.SITE_ORIGIN || "https://sinatabar.github.io",
);
if (!process.env.BASE_PATH && !process.env.SITE_ORIGIN)
  site.pathname = "/tehran-metro-atlas/";
const template = await readFile(path.join(out, "index.html"), "utf8");
const a = JSON.parse(await readFile(path.join(out, "data/atlas.json"), "utf8"));
const esc = (s) =>
  String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
const urls = [];
const status = {
  operational: "در بهره‌برداری",
  under_construction: "در حال ساخت",
  contract_awarded: "قرارداد واگذارشده",
  approved: "مصوب",
  in_planning: "در حال برنامه‌ریزی",
  proposed: "پیشنهادی",
  unknown: "نامشخص",
  temporarily_closed: "تعطیل موقت",
  suspended: "متوقف",
  cancelled: "لغوشده",
};
const kinds = ["lines", "stations", "projects", "places"];
function pageLinks(lang, scope) {
  return scope
    .map(
      (k) =>
        "<section><h2>" +
        {
          lines: ["خطوط", "Lines"],
          stations: ["ایستگاه‌ها", "Stations"],
          projects: ["پروژه‌ها", "Projects"],
          places: ["مکان‌ها", "Places"],
        }[k][lang === "fa" ? 0 : 1] +
        "</h2><ul>" +
        a[k]
          .map(
            (r) =>
              '<li><a href="' +
              base +
              lang +
              "/" +
              k +
              "/" +
              encodeURIComponent(r.id) +
              '/">' +
              esc(r.name[lang]) +
              "</a></li>",
          )
          .join("") +
        "</ul></section>",
    )
    .join("");
}
async function emit(lang, route, record, kind, root = false) {
  const fa = lang === "fa",
    T = (f, e) => (fa ? f : e),
    brand = T("اطلس متروی تهران", "Tehran Metro Atlas");
  const routeNames = {
    "": T(
      "نقشه مترو تهران و طرح‌های آینده",
      "Tehran metro map and future network",
    ),
    directory: T("فهرست خطوط و ایستگاه‌ها", "Line and station directory"),
    timeline: T("گاه‌شمار توسعه", "Development timeline"),
    methodology: T("منابع و روش پژوهش", "Sources and methodology"),
  };
  const name = record?.name[lang] || routeNames[route];
  const title = name + " | " + brand;
  const desc = record
    ? record.notes?.[lang] ||
      [
        name,
        kind === "places"
          ? T("مرجع مکانی", "Place reference")
          : fa
            ? status[record.status]
            : record.status.replaceAll("_", " "),
        brand,
      ].join(" · ")
    : T(
        "نقشه جغرافیایی خطوط و ایستگاه‌های متروی تهران با شواهد طرح‌های توسعه، منابع و داده‌های قابل دریافت.",
        "Explore the geography of Tehran Metro, its stations, documented future projects and downloadable research data.",
      );
  const suffix = route ? route + "/" : "",
    rel = lang + "/" + suffix,
    canonical = new URL(rel, site).href;
  const related = record
    ? "<ul>" +
      a.sources
        .filter((s) => record.sourceIds.includes(s.id))
        .map(
          (s) =>
            '<li><a href="' +
            esc(s.url) +
            '">' +
            esc(s.name?.[lang] || s.title) +
            "</a></li>",
        )
        .join("") +
      "</ul>"
    : route === "directory"
      ? pageLinks(lang, kinds)
      : route === "timeline"
        ? "<ol>" +
          a.history
            .map(
              (e) =>
                "<li>" +
                esc(e.date) +
                " · " +
                esc(e.name?.[lang] || e.status) +
                "</li>",
            )
            .join("") +
          "</ol>"
        : route === "methodology"
          ? "<ul>" +
            a.sources
              .map(
                (s) =>
                  '<li><a href="' +
                  esc(s.url) +
                  '">' +
                  esc(s.name?.[lang] || s.title) +
                  "</a></li>",
              )
              .join("") +
            "</ul>"
          : pageLinks(lang, ["lines"]);
  const alternate = (l) => new URL(l + "/" + suffix, site).href;
  const structured = {
    "@context": "https://schema.org",
    "@type": record
      ? kind === "stations" && record.status === "operational"
        ? "TrainStation"
        : kind === "places"
          ? "Place"
          : "Thing"
      : "WebPage",
    name,
    url: canonical,
    description: desc,
  };
  let html = template
    .replace(
      /<html[^>]*>/,
      '<html lang="' + lang + '" dir="' + (fa ? "rtl" : "ltr") + '">',
    )
    .replace(/<title>[^<]*<\/title>/, "<title>" + esc(title) + "</title>")
    .replace(
      /<meta name="description" content="[^"]*">/,
      '<meta name="description" content="' + esc(desc) + '">',
    );
  const head =
    '<link rel="canonical" href="' +
    esc(canonical) +
    '">' +
    ["fa", "en"]
      .map(
        (l) =>
          '<link rel="alternate" hreflang="' +
          l +
          '" href="' +
          esc(alternate(l)) +
          '">',
      )
      .join("") +
    '<meta property="og:title" content="' +
    esc(title) +
    '"><meta property="og:description" content="' +
    esc(desc) +
    '"><meta property="og:type" content="website"><meta property="og:url" content="' +
    esc(canonical) +
    '"><meta property="og:image" content="' +
    new URL("social.png", site).href +
    '"><meta property="og:locale" content="' +
    (fa ? "fa_IR" : "en_US") +
    '"><meta name="twitter:card" content="summary_large_image"><script type="application/ld+json">' +
    JSON.stringify(structured).replaceAll("<", "\\u003c") +
    "</script>";
  const nav =
    "<nav>" +
    Object.entries(routeNames)
      .map(
        ([k, v]) =>
          '<a href="' +
          base +
          lang +
          "/" +
          (k ? k + "/" : "") +
          '">' +
          esc(v) +
          "</a>",
      )
      .join(" · ") +
    "</nav>";
  html = html
    .replace("</head>", head + "</head>")
    .replace(
      /<div id="root">[\s\S]*?<\/main><\/div>/,
      '<div id="root"><main class="static-page">' +
        nav +
        "<h1>" +
        esc(name) +
        "</h1><p>" +
        esc(desc) +
        "</p>" +
        related +
        '<footer>© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a></footer></main></div>',
    );
  const folder = path.join(out, root ? "" : rel);
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, "index.html"), html);
  if (!root) urls.push(canonical);
}
await emit("fa", "", null, null, true);
for (const lang of ["fa", "en"]) {
  for (const page of ["", "directory", "timeline", "methodology"])
    await emit(lang, page, null, null);
  for (const kind of kinds)
    for (const r of a[kind]) await emit(lang, kind + "/" + r.id, r, kind);
}
await writeFile(
  out + "/sitemap.xml",
  '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
    urls
      .map(
        (u) =>
          "<url><loc>" +
          esc(u) +
          "</loc><lastmod>" +
          a.updated +
          "</lastmod></url>",
      )
      .join("") +
    "</urlset>",
);
await writeFile(
  out + "/robots.txt",
  "User-agent: *\nAllow: /\nSitemap: " +
    new URL("sitemap.xml", site).href +
    "\n",
);
await writeFile(out + "/.nojekyll", "");
// Draw the shared preview from the same passenger alignment vertices as the map.
const projected = ([x, y]) =>
  [(x - 51.12) * 3200, (35.855 - y) * 3950].map((v) => v.toFixed(1)).join(",");
const rails = a.segments
  .filter((s) => s.geometry)
  .map((s) => {
    const color =
      a.lines.find((l) => l.id === s.lineIds[0])?.color || "#526778";
    const parts =
      s.geometry.type === "LineString"
        ? [s.geometry.coordinates]
        : s.geometry.coordinates;
    return parts
      .map(
        (p) =>
          '<polyline fill="none" stroke="' +
          esc(color) +
          '" stroke-width="5" points="' +
          p.map(projected).join(" ") +
          '"/>',
      )
      .join("");
  })
  .join("");
const dots = a.stations
  .filter((s) => s.geometry?.type === "Point")
  .map((s) => {
    const [x, y] = projected(s.geometry.coordinates).split(",");
    return (
      '<circle cx="' +
      x +
      '" cy="' +
      y +
      '" r="3.8" fill="white" stroke="#273b4c" stroke-width="1.4"/>'
    );
  })
  .join("");
const svg =
  '<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg"><rect width="1200" height="630" fill="#e8eae3"/><g>' +
  rails +
  dots +
  '</g><rect x="28" y="28" width="548" height="105" rx="13" fill="#18293a"/><text x="53" y="80" font-size="39" font-family="sans-serif" fill="white">Tehran Metro Atlas</text><text x="55" y="109" font-size="18" font-family="sans-serif" fill="#efd18b">Passenger network · ' +
  esc(a.updated) +
  '</text><rect x="827" y="592" width="373" height="38" fill="white"/><text x="844" y="618" font-family="sans-serif" font-size="18" fill="#36464a">© OpenStreetMap contributors · ODbL</text></svg>';
await sharp(Buffer.from(svg))
  .png()
  .toFile(out + "/social.png");
const assets = (await readdir(out + "/assets")).sort();
const precache = [
  "./",
  "fa/",
  "en/",
  "atlas.svg",
  "data/atlas.json",
  "data/context.geojson",
  ...assets.map((s) => "assets/" + s),
];
const releaseHash = createHash("sha256")
  .update(JSON.stringify(assets))
  .update(await readFile(out + "/data/checksums.json"))
  .digest("hex")
  .slice(0, 16);
const sw = await readFile("apps/web/offline-worker.js", "utf8");
await writeFile(
  out + "/offline-worker.js",
  "const assets = " +
    JSON.stringify(precache) +
    ";\n" +
    sw.replace("__CACHE_KEY__", "atlas-" + releaseHash),
);
console.log(
  "Generated " +
    urls.length +
    " bilingual public pages, sitemap, offline worker and sharing preview.",
);
const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
const notices = [await readFile("LICENSE", "utf8")];
for (const [folder, pkg] of Object.entries(lock.packages).sort(([a], [b]) =>
  a.localeCompare(b),
)) {
  if (!folder || pkg.dev) continue;
  const files = (await readdir(folder)).filter((f) =>
    /^(licen[cs]e|notice|ofl|copying|unlicense)(\.|$)/i.test(f),
  );
  const legal = await Promise.all(
    files.map((f) => readFile(path.join(folder, f), "utf8")),
  );
  if (!legal.length && folder.endsWith("/murmurhash-js"))
    legal.push(await readFile(path.join(folder, "README.md"), "utf8"));
  notices.push(
    [
      folder.replace(/^node_modules\//, ""),
      pkg.version,
      pkg.license || "",
    ].join(" ") +
      "\n" +
      legal.join("\n"),
  );
}
await writeFile(out + "/third-party-notices.txt", notices.join("\n\n"));
