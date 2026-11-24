import { useEffect, useMemo, useRef, useState } from "react";
import {
  Map as GLMap,
  setWorkerUrl,
  type Map as MapInstance,
  type StyleSpecification,
  type GeoJSONSource,
  type LayerSpecification,
} from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import type { FeatureCollection, Feature, Geometry, Position } from "geojson";
import {
  Compass,
  Crosshair,
  Expand,
  Layers,
  Minus,
  Plus,
  Share2,
  X,
  Check,
  Navigation2,
  MapPin,
  List,
} from "lucide-react";
import {
  base,
  badgeInk,
  point,
  isUncertain,
  visible,
  groupFor,
  lineColor,
  n,
  term,
  groups,
  type Atlas,
  type Lang,
  type Filters,
  type Choice,
  type RecordItem,
} from "./model";
setWorkerUrl(workerUrl);
const empty: FeatureCollection = { type: "FeatureCollection", features: [] };
const home = { lng: 51.385, lat: 35.711, zoom: 10.85 };
function camera() {
  const saved = new URLSearchParams(location.search)
    .get("view")
    ?.split(",")
    .map(Number);
  if (
    saved?.length === 3 &&
    saved.every(Number.isFinite) &&
    saved[0] >= 49 &&
    saved[0] <= 54 &&
    saved[1] >= 34 &&
    saved[1] <= 37 &&
    saved[2] >= 7 &&
    saved[2] <= 17
  )
    return { lng: saved[0], lat: saved[1], zoom: saved[2] };
  return home;
}
const fg = (
  id: string,
  source: string,
  paint: Record<string, unknown>,
  extra: Record<string, unknown> = {},
): LayerSpecification =>
  ({ id, source, type: "line", paint, ...extra }) as LayerSpecification;
function mapStyle(dark: boolean): StyleSpecification {
  const classIs = (c: string) => ["==", ["get", "class"], c];
  const zoomWidth = (low: number, high: number) => [
    "interpolate",
    ["linear"],
    ["zoom"],
    9,
    low,
    14,
    high,
  ];
  const color: ["get", string] = ["get", "color"],
    lineOpacity = ["case", ["get", "uncertain"], 0.81, 0.98];
  return {
    version: 8,
    sources: {
      context: { type: "geojson", data: empty },
      rail: { type: "geojson", data: empty },
      stop: { type: "geojson", data: empty },
      areas: { type: "geojson", data: empty },
      site: { type: "geojson", data: empty },
    },
    layers: [
      {
        id: "background",
        type: "background",
        paint: { "background-color": dark ? "#172638" : "#eae9e2" },
      },
      ...["park", "water"].map(
        (c) =>
          ({
            id: c,
            type: "fill",
            source: "context",
            filter: classIs(c),
            paint: {
              "fill-color":
                c === "park"
                  ? dark
                    ? "#28483e"
                    : "#cbdcc0"
                  : dark
                    ? "#294852"
                    : "#b9d7dd",
              "fill-opacity": 0.85,
            },
          }) as LayerSpecification,
      ),
      fg(
        "river",
        "context",
        {
          "line-color": dark ? "#315368" : "#b5cfd1",
          "line-width": zoomWidth(0.8, 2),
        },
        { filter: classIs("river") },
      ),
      fg(
        "street",
        "context",
        {
          "line-color": dark ? "#2f4150" : "#f9f8f4",
          "line-width": zoomWidth(0.65, 2.2),
        },
        { filter: classIs("street") },
      ),
      ...["road-minor", "road-major"].map((c, i) =>
        fg(
          c,
          "context",
          {
            "line-color": dark
              ? i
                ? "#536076"
                : "#354555"
              : i
                ? "#fffdf3"
                : "#f8f7f1",
            "line-width": zoomWidth(i ? 1.5 : 0.7, i ? 6 : 3),
          },
          { filter: classIs(c) },
        ),
      ),
      {
        id: "uncertainty",
        source: "areas",
        type: "fill",
        paint: { "fill-color": "#bf8021", "fill-opacity": 0.2 },
      },
      fg("halo", "rail", {
        "line-color": dark ? "#1a2839" : "#fffdf4",
        "line-width": zoomWidth(4, 9),
        "line-opacity": 0.9,
      }),
      ...groups.map((g) =>
        fg(
          "route-" + g,
          "rail",
          {
            "line-color": color,
            "line-opacity": lineOpacity,
            "line-width": zoomWidth(2.4, 5.8),
            ...(g === "operational"
              ? {}
              : {
                  "line-dasharray":
                    g === "proposed"
                      ? [1, 2]
                      : g === "under_construction"
                        ? [4, 2]
                        : [4, 2, 1, 2],
                }),
          },
          {
            filter: ["==", ["get", "group"], g],
            layout: { "line-join": "round", "line-cap": "round" },
          },
        ),
      ),
      {
        id: "project-area",
        type: "fill",
        source: "site",
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: { "fill-color": "#c88939", "fill-opacity": 0.26 },
      },
      fg(
        "project-path",
        "site",
        { "line-color": "#b07528", "line-width": 3, "line-dasharray": [3, 2] },
        { filter: ["==", ["geometry-type"], "LineString"] },
      ),
      {
        id: "sites",
        source: "site",
        type: "circle",
        filter: ["==", ["geometry-type"], "Point"],
        paint: {
          "circle-color": "#c88939",
          "circle-radius": 7,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#fff",
        },
      },
      {
        id: "future-station",
        type: "symbol",
        source: "stop",
        filter: ["==", ["get", "future"], true],
        layout: {
          "icon-image": "future-diamond",
          "icon-allow-overlap": true,
          "icon-size": ["interpolate", ["linear"], ["zoom"], 9, 0.5, 15, 1.2],
        },
      },
      {
        id: "station",
        source: "stop",
        type: "circle",
        filter: ["==", ["get", "future"], false],
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            9,
            1.7,
            11,
            3,
            14,
            5.7,
          ],
          "circle-color": ["case", ["get", "future"], "#f3c985", "#fff"],
          "circle-stroke-color": color,
          "circle-stroke-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            9,
            1,
            14,
            2.2,
          ],
        },
      },
      {
        id: "interchange",
        source: "stop",
        type: "circle",
        filter: ["==", ["get", "interchange"], true],
        paint: {
          "circle-color": "#fff",
          "circle-stroke-color": "#26394a",
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            9,
            3.2,
            14,
            7.4,
          ],
          "circle-stroke-width": 2,
        },
      },
      {
        id: "interchange-core",
        source: "stop",
        type: "circle",
        filter: ["==", ["get", "interchange"], true],
        paint: {
          "circle-color": "#26394a",
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 1, 14, 2.6],
        },
      },
    ],
  };
}
function feature(r: RecordItem, atlas: Atlas, f: Filters): Feature | undefined {
  if (!r.geometry) return;
  const id = r.lineIds?.find((l) => !f.hidden.includes(l));
  return {
    type: "Feature",
    geometry: r.geometry,
    properties: {
      id: r.id,
      color: lineColor(atlas.lines.find((l) => l.id === id)),
      lineId: id,
      group: groupFor(r.status),
      uncertain: isUncertain(r),
      future: r.status !== "operational",
      interchange: !!r.interchange,
    },
  };
}
const collection = (
  records: RecordItem[],
  a: Atlas,
  f: Filters,
): FeatureCollection => ({
  type: "FeatureCollection",
  features: records
    .filter((r) => visible(r, f))
    .flatMap((r) => feature(r, a, f) || []),
});
function uncertainty(
  stations: RecordItem[],
  a: Atlas,
  f: Filters,
): FeatureCollection {
  const features: Feature[] = [];
  for (const r of stations) {
    if (r.uncertaintyGeometry && visible(r, f)) {
      features.push({
        type: "Feature",
        geometry: r.uncertaintyGeometry,
        properties: { id: r.id },
      });
      continue;
    }
    const p = point(r),
      radius = r.uncertaintyM;
    if (!p || !radius || !isUncertain(r) || !visible(r, f)) continue;
    const ring = Array.from({ length: 49 }, (_, i) => {
      const theta = (i / 48) * 2 * Math.PI;
      return [
        p[0] +
          (Math.cos(theta) * radius) /
            (111320 * Math.cos((p[1] * Math.PI) / 180)),
        p[1] + (Math.sin(theta) * radius) / 111320,
      ];
    });
    features.push({
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [ring] },
      properties: { id: r.id },
    });
  }
  return { type: "FeatureCollection", features };
}
function positions(g: Geometry | null): Position[] {
  if (!g) return [];
  if (g.type === "Point") return [g.coordinates];
  if (g.type === "LineString" || g.type === "MultiPoint") return g.coordinates;
  if (g.type === "MultiLineString" || g.type === "Polygon")
    return g.coordinates.flat();
  if (g.type === "MultiPolygon") return g.coordinates.flat(2);
  return g.geometries.flatMap(positions);
}
export interface MapProps {
  atlas: Atlas;
  lang: Lang;
  dark: boolean;
  filters: Filters;
  setFilters: (v: Filters) => void;
  choice: Choice | null;
  select: (v: Choice) => void;
  openDirectory: () => void;
  onExplore: () => void;
}
export default function NetworkMap(props: MapProps) {
  const { atlas, lang, dark, filters, setFilters, choice } = props;
  const fa = lang === "fa",
    T = (f: string, e: string) => (fa ? f : e);
  const canvas = useRef<HTMLDivElement>(null),
    host = useRef<HTMLElement>(null),
    map = useRef<MapInstance | null>(null),
    live = useRef(props);
  live.current = props;
  const [loaded, setLoaded] = useState(0),
    [unavailable, setUnavailable] = useState(false),
    [extent, setExtent] = useState(camera),
    [frame, setFrame] = useState(0);
  const [panel, setPanel] = useState<"layers" | "legend" | null>(null),
    [copied, setCopied] = useState(false),
    [shareURL, setShareURL] = useState(""),
    [expanded, setExpanded] = useState(false);
  const [context, setContext] = useState<FeatureCollection>(empty),
    [contextFailed, setContextFailed] = useState(false);
  const initialView = useRef(camera()),
    initialChoice = useRef(true);
  useEffect(() => {
    const abort = new AbortController();
    fetch(base + "data/context.geojson", { signal: abort.signal })
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then(setContext)
      .catch(() => {
        if (!abort.signal.aborted) setContextFailed(true);
      });
    return () => abort.abort();
  }, []);
  useEffect(() => {
    if (!canvas.current) return;
    let m: MapInstance;
    try {
      const c = initialView.current;
      m = new GLMap({
        container: canvas.current,
        style: mapStyle(live.current.dark),
        center: [c.lng, c.lat],
        zoom: c.zoom,
        minZoom: 7,
        maxZoom: 17,
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
        keyboard: true,
        canvasContextAttributes: { antialias: true },
        renderWorldCopies: false,
      });
    } catch {
      setUnavailable(true);
      return;
    }
    map.current = m;
    m.touchZoomRotate.disableRotation();
    m.keyboard.disableRotation();
    const render = () => setFrame((v) => v + 1);
    const end = () => {
      const c = m.getCenter(),
        z = m.getZoom();
      setExtent({ lng: c.lng, lat: c.lat, zoom: z });
      const url = new URL(location.href);
      url.searchParams.set(
        "view",
        [c.lng.toFixed(5), c.lat.toFixed(5), z.toFixed(2)].join(","),
      );
      history.replaceState(history.state, "", url);
    };
    m.on("style.load", () => {
      if (!m.hasImage("future-diamond")) {
        const icon = new Uint8Array(18 * 18 * 4);
        for (let y = 0; y < 18; y++)
          for (let x = 0; x < 18; x++) {
            const d = Math.abs(x - 8.5) + Math.abs(y - 8.5);
            if (d <= 8.5)
              icon.set(
                d > 6 ? [44, 55, 59, 255] : [243, 201, 133, 255],
                (y * 18 + x) * 4,
              );
          }
        m.addImage("future-diamond", { width: 18, height: 18, data: icon });
      }
      setLoaded((v) => v + 1);
    });
    m.on("move", render);
    m.on("moveend", end);
    m.on("resize", render);
    m.on("click", (e) => {
      const list = [
        "interchange",
        "station",
        "future-station",
        "sites",
        "project-area",
        "project-path",
        ...groups.map((g) => "route-" + g),
      ].filter((l) => m.getLayer(l));
      if (!list.length) return;
      const hits = m.queryRenderedFeatures(
        [
          [e.point.x - 5, e.point.y - 5],
          [e.point.x + 5, e.point.y + 5],
        ],
        { layers: list },
      );
      const hit =
        hits.find(
          (x) => x.layer.id === "interchange" || x.layer.id === "station",
        ) ?? hits[0];
      if (!hit) return;
      const kind =
        hit.source === "rail"
          ? "lines"
          : hit.source === "site"
            ? "projects"
            : "stations";
      live.current.select({
        kind,
        id: kind === "lines" ? hit.properties.lineId : hit.properties.id,
      });
    });
    m.on("mousemove", (e) => {
      const layers = ["station", "sites", "route-operational"].filter((l) =>
        m.getLayer(l),
      );
      m.getCanvas().style.cursor =
        layers.length && m.queryRenderedFeatures(e.point, { layers }).length
          ? "pointer"
          : "";
    });
    const ro = new ResizeObserver(() => m.resize());
    ro.observe(canvas.current);
    return () => {
      ro.disconnect();
      m.remove();
      map.current = null;
    };
  }, []);
  const previousDark = useRef(dark);
  useEffect(() => {
    if (map.current && previousDark.current !== dark) {
      previousDark.current = dark;
      map.current.setStyle(mapStyle(dark), { diff: false });
    }
  }, [dark]);
  const stations = useMemo(
    () => atlas.stations.filter((r) => visible(r, filters) && !!point(r)),
    [atlas, filters],
  );
  const layers = useMemo(
    () => ({
      context,
      rail: collection(
        [...atlas.segments, ...atlas.alternatives],
        atlas,
        filters,
      ),
      stop: filters.stations ? collection(stations, atlas, filters) : empty,
      site: filters.projects
        ? collection(atlas.projects, atlas, filters)
        : empty,
      areas:
        filters.uncertain && filters.stations
          ? uncertainty(stations, atlas, filters)
          : empty,
    }),
    [atlas, context, filters, stations],
  );
  useEffect(() => {
    if (!loaded) return;
    for (const [id, fc] of Object.entries(layers)) {
      (map.current?.getSource(id) as GeoJSONSource | undefined)?.setData(fc);
    }
  }, [layers, loaded]);
  const hadSelection = useRef("");
  const initialDeepLink = useRef(
    !!props.choice && new URLSearchParams(location.search).has("view"),
  );
  useEffect(() => {
    if (!choice) {
      hadSelection.current = "";
      return;
    }
    const m = map.current,
      key = choice.kind + choice.id;
    if (!m || !loaded || hadSelection.current === key) return;
    hadSelection.current = key;
    if (initialChoice.current && initialDeepLink.current) {
      initialChoice.current = false;
      return;
    }
    initialChoice.current = false;
    const r = atlas[choice.kind].find((x) => x.id === choice.id);
    if (!r) return;
    const coords =
      choice.kind === "lines"
        ? atlas.segments
            .filter((s) => s.lineIds.includes(r.id))
            .flatMap((s) => positions(s.geometry))
        : positions(r.geometry);
    if (!coords.length) return;
    const anim = matchMedia("(prefers-reduced-motion: reduce)").matches
      ? 0
      : 450;
    if (coords.length === 1) {
      m.easeTo({
        center: coords[0] as [number, number],
        zoom: Math.max(m.getZoom(), 13.2),
        duration: anim,
      });
      return;
    }
    let west = Infinity,
      east = -Infinity,
      south = Infinity,
      north = -Infinity;
    for (const [x, y] of coords) {
      west = Math.min(west, x);
      east = Math.max(east, x);
      north = Math.max(north, y);
      south = Math.min(south, y);
    }
    m.fitBounds(
      [
        [west, south],
        [east, north],
      ],
      { padding: 50, maxZoom: 14, duration: anim },
    );
  }, [choice, atlas, loaded]);
  const districts = useMemo(
    () =>
      context.features.filter(
        (f) =>
          f.geometry?.type === "Point" && f.properties?.class === "district",
      ),
    [context],
  );
  const labels = useMemo(() => {
    const m = map.current;
    if (!m || !loaded || !canvas.current) return [];
    const { clientWidth: w, clientHeight: h } = canvas.current,
      z = m.getZoom();
    const used: { x: number; y: number; w: number; h: number }[] = [],
      result: {
        id: string;
        x: number;
        y: number;
        text: string;
        style: string;
        color?: string;
        choice?: Choice;
      }[] = [];
    function place(
      id: string,
      p: Position,
      text: string,
      style: string,
      color?: string,
      link?: Choice,
    ) {
      if (!text) return;
      const screen = m!.project([p[0], p[1]]),
        x = screen.x,
        y = screen.y + (style === "stop-label" ? 14 : 0);
      const width =
        style === "line-label"
          ? 24
          : Math.min(135, Math.max(40, text.length * 7));
      const height = style === "district" ? 32 : 22;
      if (
        x < width / 2 ||
        x > w - width / 2 ||
        y < height ||
        y > h - 38 ||
        used.some(
          (b) =>
            Math.abs(x - b.x) < (width + b.w) / 2 + 8 &&
            Math.abs(y - b.y) < (height + b.h) / 2 + 8,
        )
      )
        return;
      used.push({ x, y, w: width, h: height });
      result.push({ id, x, y, text, style, color, choice: link });
    }
    const selected =
      choice && atlas[choice.kind].find((x) => x.id === choice.id);
    if (
      selected &&
      point(selected) &&
      visible(selected, filters) &&
      (choice?.kind !== "stations" || filters.stations)
    )
      place(
        "selected",
        point(selected)!,
        selected.name[lang],
        "selected-label",
      );
    for (const line of atlas.lines) {
      const pts = stations.filter(
        (s) => s.lineIds.includes(line.id) && !s.interchange,
      );
      if (!pts.length || filters.hidden.includes(line.id)) continue;
      const within = pts.filter((s) => {
        const p = m.project(point(s)!);
        return p.x > 64 && p.x < w - 64 && p.y > 65 && p.y < h - 85;
      });
      if (within.length) {
        const at = within[Math.floor(within.length * 0.38)];
        place(
          line.id,
          point(at)!,
          n(Number(line.number), lang),
          "line-label",
          lineColor(line),
          { id: line.id, kind: "lines" },
        );
      }
    }
    if (z >= 12.1 && filters.stations) {
      for (const s of [...stations].sort(
        (a, b) => Number(b.interchange) - Number(a.interchange),
      ))
        place(s.id, point(s)!, s.name[lang], "stop-label", undefined, {
          id: s.id,
          kind: "stations",
        });
    }
    const step = z < 10.4 ? 6 : z < 11.6 ? 3 : 1;
    districts.forEach((d, i) => {
      if (i % step === 0 && d.geometry.type === "Point")
        place(
          "d" + i,
          d.geometry.coordinates,
          d.properties?.[fa ? "nameFa" : "nameEn"] || "",
          "district",
        );
    });
    return result;
  }, [frame, loaded, stations, districts, atlas, choice, filters, lang, fa]);
  const doShare = async () => {
    const u = new URL(location.href);
    u.searchParams.set(
      "view",
      [
        extent.lng.toFixed(5),
        extent.lat.toFixed(5),
        extent.zoom.toFixed(2),
      ].join(","),
    );
    try {
      await navigator.clipboard.writeText(u.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setShareURL(u.href);
    }
  };
  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setExpanded(false);
        setPanel(null);
        setShareURL("");
      }
    };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, []);
  const tIcon = (icon: React.ReactNode, label: string, fn: () => void) => (
    <button type="button" aria-label={label} title={label} onClick={fn}>
      {icon}
    </button>
  );
  const filtersList: [
    keyof Pick<Filters, "stations" | "uncertain" | "projects">,
    string,
  ][] = [
    ["stations", T("نمایش ایستگاه‌ها", "Show stations")],
    ["projects", T("مکان پروژه‌ها", "Project locations")],
    [
      "uncertain",
      T("مکان‌ها و مسیرهای تقریبی", "Approximate locations and routes"),
    ],
  ];
  return (
    <section
      className={"map-frame" + (expanded ? " expanded" : "")}
      ref={host}
      aria-label={T("نقشه جغرافیایی شبکه", "Geographical network map")}
    >
      <div ref={canvas} className="map-canvas" data-testid="network-map" />
      <div aria-hidden="true" className="map-labels">
        {labels.map((l) => (
          <span
            key={l.id}
            className={l.style}
            style={{
              left: l.x,
              top: l.y,
              backgroundColor: l.color,
              color: l.color ? badgeInk(l.color) : undefined,
            }}
          >
            {l.text}
          </span>
        ))}
      </div>
      <div className="map-heading">
        <span className="map-icon">
          <MapPin size={18} />
        </span>
        <div>
          <b>{T("تهران و حومه", "Greater Tehran")}</b>
          <small>{T("نقشه جغرافیایی", "Geographic map")}</small>
        </div>
      </div>
      <button className="mobile-explore floating" onClick={props.onExplore}>
        <List size={17} />
        {T("کاوش در شبکه", "Explore network")}
      </button>
      <div className="map-tools floating">
        {tIcon(<Plus />, T("بزرگ‌نمایی", "Zoom in"), () =>
          map.current?.zoomIn(),
        )}
        {tIcon(<Minus />, T("کوچک‌نمایی", "Zoom out"), () =>
          map.current?.zoomOut(),
        )}
        {tIcon(<Crosshair />, T("مرکز تهران", "Center on Tehran"), () =>
          map.current?.easeTo({
            center: [home.lng, home.lat],
            zoom: home.zoom,
            bearing: 0,
            pitch: 0,
          }),
        )}
        {tIcon(
          expanded ? <X /> : <Expand />,
          T("تمام‌صفحه", "Toggle fullscreen"),
          () => setExpanded(!expanded),
        )}
        {tIcon(
          copied ? <Check /> : <Share2 />,
          T("کپی پیوند نقشه", "Copy map link"),
          doShare,
        )}
      </div>
      {copied && (
        <div className="map-toast" role="status">
          {T("پیوند نقشه کپی شد", "Map link copied")}
        </div>
      )}
      {shareURL && (
        <label className="map-share floating">
          {T("پیوند نقشه", "Map link")}
          <input readOnly value={shareURL} onFocus={(e) => e.target.select()} />
          <button
            onClick={() => setShareURL("")}
            aria-label={T("بستن", "Close")}
          >
            <X size={16} />
          </button>
        </label>
      )}
      {unavailable && (
        <div className="map-error floating">
          <Compass />
          <b>
            {T(
              "نقشه سه‌بعدی در این مرورگر در دسترس نیست",
              "Map rendering is unavailable in this browser",
            )}
          </b>
          <button onClick={props.openDirectory}>
            {T("باز کردن فهرست شبکه", "Open the network directory")}
          </button>
        </div>
      )}
      {contextFailed && !unavailable && (
        <div className="map-toast" role="status">
          {T(
            "داده‌های نقشه پایه در دسترس نیست",
            "Background geography unavailable",
          )}
        </div>
      )}
      <div className="map-bottom">
        <div className="overlay-actions">
          <button
            className={"floating " + (panel === "layers" ? "active" : "")}
            aria-expanded={panel === "layers"}
            onClick={() => setPanel(panel === "layers" ? null : "layers")}
          >
            <Layers size={16} />
            {T("لایه‌ها", "Layers")}
          </button>
          <button
            className="floating"
            aria-expanded={panel === "legend"}
            onClick={() => setPanel(panel === "legend" ? null : "legend")}
          >
            <span className="legend-symbol" />
            {T("راهنما", "Legend")}
          </button>
        </div>
        <div className="north" title={T("شمال", "North")}>
          <Navigation2 size={20} />
          <small>N</small>
        </div>
      </div>
      {panel && (
        <div className="map-panel floating">
          <header>
            <b>
              {panel === "layers"
                ? T("لایه‌های نقشه", "Map layers")
                : T("راهنمای نقشه", "Map legend")}
            </b>
            {tIcon(<X size={16} />, T("بستن", "Close"), () => setPanel(null))}
          </header>
          {panel === "layers" ? (
            <>
              {groups.map((g) => (
                <label key={g}>
                  <input
                    type="checkbox"
                    checked={filters.groups.includes(g)}
                    onChange={() =>
                      setFilters({
                        ...filters,
                        groups: filters.groups.includes(g)
                          ? filters.groups.filter((x) => x !== g)
                          : [...filters.groups, g],
                      })
                    }
                  />
                  {g === "other"
                    ? T("سایر وضعیت‌ها", "Other statuses")
                    : term(g, lang)}
                </label>
              ))}
              <hr />
              {filtersList.map(([key, label]) => (
                <label key={key}>
                  <input
                    type="checkbox"
                    checked={filters[key]}
                    onChange={() =>
                      setFilters({ ...filters, [key]: !filters[key] })
                    }
                  />
                  {label}
                </label>
              ))}
            </>
          ) : (
            <>
              {[
                "operational",
                "under_construction",
                "approved",
                "proposed",
                "approximate",
                "stations",
                "interchange",
                "future-stop",
              ].map((k) => (
                <div className="legend-row" key={k}>
                  <i className={"sample " + k} />
                  {k === "interchange"
                    ? T("ایستگاه تقاطعی", "Interchange")
                    : k === "future-stop"
                      ? T("ایستگاه آینده", "Future station")
                      : term(k, lang)}
                </div>
              ))}
            </>
          )}
        </div>
      )}
      <footer className="map-foot">
        <span dir="ltr">
          {extent.lat.toFixed(3)}° N &nbsp; {extent.lng.toFixed(3)}° E
        </span>
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
        >
          © OpenStreetMap contributors
        </a>
      </footer>
    </section>
  );
}
