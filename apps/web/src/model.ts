import type { Geometry, Point, Position } from "geojson";

export type Lang = "fa" | "en";
export type LocalName = Record<Lang, string>;
export type Section = "map" | "directory" | "timeline" | "methodology";
export type EntityKind = "lines" | "stations" | "projects" | "places";
export interface RecordItem {
  id: string;
  name: LocalName;
  status: string;
  confidence: string;
  geometry: Geometry | null;
  lineIds: string[];
  sourceIds: string[];
  notes?: LocalName | null;
  aliases?: string[];
  color?: string | null;
  number?: number | string;
  interchange?: boolean;
  opened?: string | null;
  expected?: string | { start?: string; end?: string } | null;
  constructionStatus?: string | null;
  dateConfidence?: string | null;
  alignmentType?: string | null;
  projectId?: string;
  osmRefs?: string[];
  accessibility?: { wheelchair?: string; sourceIds?: string[] } | null;
  uncertaintyGeometry?: Geometry | null;
  uncertaintyM?: number | null;
  lastVerified?: string | null;
}
export interface Source {
  id: string;
  name?: LocalName;
  title: string | LocalName;
  publisher: string | LocalName;
  url: string;
  published: string | null;
  retrieved: string;
  type: string;
  reliability: string;
  license: string;
}
export interface EventItem {
  id: string;
  date: string;
  name?: LocalName;
  title?: LocalName;
  status?: string;
  sourceIds: string[];
  entityId?: string;
  lineIds?: string[];
  notes?: LocalName | null;
}
export interface Atlas {
  version: string;
  updated: string;
  lines: RecordItem[];
  stations: RecordItem[];
  projects: RecordItem[];
  places: RecordItem[];
  segments: RecordItem[];
  alternatives: RecordItem[];
  sources: Source[];
  history: EventItem[];
  services: {
    id: string;
    lineId: string;
    stationIds?: string[];
    stationId?: string;
    status?: string;
    sourceIds?: string[];
    name?: LocalName;
  }[];
  metrics: {
    operationalLines: number;
    operationalStations: number;
    futureLines: number;
    stationsUnderConstruction: number;
    approvedStations: number;
    operationalLengthKm: number | null;
    plannedLengthKm: number | null;
    mappedPassengerLengthKm: number | null;
    knownOpeningsByDate: Record<string, number>;
    operationalStationsWithOpeningDate: number;
  };
}
export type Choice = { kind: EntityKind; id: string };
export const kinds: EntityKind[] = ["lines", "stations", "projects", "places"];
export const sectionKeys: Section[] = [
  "map",
  "directory",
  "timeline",
  "methodology",
];
export const base = import.meta.env.BASE_URL;
export const n = (value: number, lang: Lang) =>
  new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(value);
export function date(value: string | null | undefined, lang: Lang) {
  if (!value) return lang === "fa" ? "ثبت نشده" : "Unrecorded";
  const exact = /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (!exact) return value;
  return new Intl.DateTimeFormat(lang === "fa" ? "fa-IR" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value + "T12:00:00Z"));
}
export const tr = (value: string | LocalName | null | undefined, lang: Lang) =>
  typeof value === "string"
    ? value
    : value?.[lang] || value?.fa || value?.en || "";
export const norm = (s: string) =>
  s
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0300-\u036f]/g, "")
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
    .replace(/[\s\u200c\u200d'’\-ـ]/g, "");
const terms: Record<string, [string, string]> = {
  operational: ["در بهره‌برداری", "Operational"],
  temporarily_closed: ["تعطیل موقت", "Temporarily closed"],
  under_construction: ["در حال ساخت", "Under construction"],
  contract_awarded: ["قرارداد واگذارشده", "Contract awarded"],
  approved: ["مصوب", "Approved"],
  in_planning: ["در حال برنامه‌ریزی", "In planning"],
  proposed: ["پیشنهادی", "Proposed"],
  suspended: ["متوقف", "Suspended"],
  cancelled: ["لغوشده", "Cancelled"],
  unknown: ["نامشخص", "Unknown"],
  verified: ["تأییدشده", "Verified"],
  high: ["اطمینان بالا", "High confidence"],
  high_confidence: ["اطمینان بالا", "High confidence"],
  approximate: ["تقریبی", "Approximate"],
  indicative: ["برآورد از طرح", "Indicative"],
  lines: ["خطوط", "Lines"],
  stations: ["ایستگاه‌ها", "Stations"],
  projects: ["پروژه‌ها", "Projects"],
  places: ["مکان‌ها", "Places"],
  map: ["نقشه شبکه", "Network map"],
  directory: ["فهرست", "Directory"],
  timeline: ["گاه‌شمار", "Timeline"],
  methodology: ["منابع و روش", "Methodology"],
  actual: ["مسیر موجود", "Mapped railway"],
  official_planned: ["مسیر مصوب", "Official alignment"],
  approximate_planned: ["مسیر تقریبی", "Approximate alignment"],
  schematic: ["شماتیک", "Schematic"],
};
export const term = (key: string | undefined | null, lang: Lang) =>
  terms[key || "unknown"]?.[lang === "fa" ? 0 : 1] ??
  (key || "").replaceAll("_", " ");
export const isUncertain = (r: RecordItem) =>
  ["indicative", "approximate"].includes(r.confidence) ||
  ["schematic", "approximate_planned"].includes(r.alignmentType || "");
export const groups = [
  "operational",
  "under_construction",
  "approved",
  "proposed",
  "other",
] as const;
export type Group = (typeof groups)[number];
export const groupFor = (s: string): Group =>
  s === "contract_awarded"
    ? "approved"
    : s === "in_planning"
      ? "proposed"
      : groups.includes(s as Group)
        ? (s as Group)
        : "other";
export type Filters = {
  hidden: string[];
  groups: Group[];
  stations: boolean;
  projects: boolean;
  uncertain: boolean;
};
export const initialFilters = (): Filters => ({
  hidden: [],
  groups: [...groups],
  stations: true,
  projects: true,
  uncertain: true,
});
export const visible = (r: RecordItem, f: Filters) =>
  f.groups.includes(groupFor(r.status)) &&
  (f.uncertain || !isUncertain(r)) &&
  (!r.lineIds?.length || r.lineIds.some((id) => !f.hidden.includes(id)));
export function search(a: Atlas, query: string) {
  const q = norm(query);
  return kinds
    .flatMap((kind) => a[kind].map((item) => ({ kind, item })))
    .filter(({ item }) =>
      [item.name.fa, item.name.en, ...(item.aliases || [])].some(
        (s) => s && norm(s).includes(q),
      ),
    );
}
export function point(r: RecordItem): [number, number] | null {
  if (r.geometry?.type !== "Point") return null;
  const [x, y] = (r.geometry as Point).coordinates;
  return [x, y];
}
export function distanceKm(a: Position, b: Position) {
  const rad = Math.PI / 180,
    dlat = (b[1] - a[1]) * rad,
    dlon = (b[0] - a[0]) * rad;
  const h =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dlon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(Math.min(1, h)));
}
export function closest(a: Atlas, r: RecordItem) {
  const position = point(r);
  if (!position) return [];
  return a.stations
    .flatMap((item) => {
      const p = point(item);
      return p ? [{ item, km: distanceKm(position, p) }] : [];
    })
    .sort((x, y) => x.km - y.km)
    .slice(0, 5);
}
export function getPath(path: string) {
  const parts = path.slice(base.length).split("/").filter(Boolean);
  const lang: Lang = parts[0] === "en" ? "en" : "fa";
  const choice =
    kinds.includes(parts[1] as EntityKind) && parts[2]
      ? { kind: parts[1] as EntityKind, id: parts[2] }
      : null;
  const section = sectionKeys.includes(parts[1] as Section)
    ? (parts[1] as Section)
    : "map";
  return { lang, choice, section };
}
export const pathFor = (
  lang: Lang,
  section: Section,
  choice: Choice | null = null,
) =>
  base +
  lang +
  "/" +
  (choice
    ? choice.kind + "/" + encodeURIComponent(choice.id) + "/"
    : section === "map"
      ? ""
      : section + "/");
export const lineColor = (line: RecordItem | undefined) =>
  line?.color || "#788199";

export function badgeInk(hex: string) {
  const rgb = hex
    .replace("#", "")
    .match(/../g)
    ?.map((c) => parseInt(c, 16) / 255);
  if (!rgb || rgb.length !== 3) return "#121a21";
  const [r, g, b] = rgb.map((c) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.179 ? "#080d11" : "#ffffff";
}
