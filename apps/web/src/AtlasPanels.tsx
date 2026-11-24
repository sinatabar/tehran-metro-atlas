import { useState, type CSSProperties } from "react";
import {
  ArrowUpRight,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Clock3,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  GitBranch,
  Layers,
  MapPin,
  Search,
  TrainFront,
  Waypoints,
  X,
} from "lucide-react";
import {
  base,
  badgeInk,
  closest,
  date,
  lineColor,
  kinds,
  n,
  pathFor,
  point,
  search,
  term,
  tr,
  type Atlas,
  type Choice,
  type EntityKind,
  type Filters,
  type Lang,
  type RecordItem,
} from "./model";
export type PanelProps = {
  atlas: Atlas;
  lang: Lang;
  select: (s: Choice) => void;
};
const useT = (lang: Lang) => (fa: string, en: string) =>
  lang === "fa" ? fa : en;
export function LineBadge({ line, lang }: { line: RecordItem; lang: Lang }) {
  return (
    <span
      className="line-badge"
      style={
        {
          "--line-color": lineColor(line),
          color: badgeInk(lineColor(line)),
        } as CSSProperties
      }
    >
      {line.number ? n(Number(line.number), lang) : "•"}
    </span>
  );
}
export function RecordLink({
  kind,
  item,
  lang,
  select,
  children,
  className,
}: {
  kind: EntityKind;
  item: RecordItem;
  lang: Lang;
  select: PanelProps["select"];
  children: React.ReactNode;
  className?: string;
}) {
  const choice = { kind, id: item.id };
  return (
    <a
      className={className}
      href={pathFor(lang, "map", choice)}
      onClick={(e) => {
        if (
          e.button === 0 &&
          !e.metaKey &&
          !e.ctrlKey &&
          !e.shiftKey &&
          !e.altKey
        ) {
          e.preventDefault();
          select(choice);
        }
      }}
    >
      {children}
    </a>
  );
}
export function SearchField({
  lang,
  query,
  setQuery,
}: {
  lang: Lang;
  query: string;
  setQuery: (s: string) => void;
}) {
  const T = useT(lang);
  return (
    <label className="search">
      <Search size={18} />
      <input
        type="search"
        aria-label={T("جست‌وجوی شبکه", "Search network")}
        placeholder={T(
          "جست‌وجوی ایستگاه، خط یا محله…",
          "Search stations, lines or places…",
        )}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
    </label>
  );
}
export function Results({
  rows,
  atlas,
  lang,
  select,
}: { rows: { kind: EntityKind; item: RecordItem }[] } & PanelProps) {
  const T = useT(lang),
    Chevron = lang === "fa" ? ChevronLeft : ChevronRight;
  if (!rows.length)
    return (
      <p className="empty">
        {T(
          "موردی در داده‌های بررسی‌شده پیدا نشد.",
          "No matching reviewed records.",
        )}
      </p>
    );
  return (
    <div className="result-list">
      {rows.map(({ item, kind }) => (
        <RecordLink
          className="result"
          key={kind + item.id}
          kind={kind}
          item={item}
          lang={lang}
          select={select}
        >
          {kind === "lines" ? (
            <LineBadge line={item} lang={lang} />
          ) : (
            <span className={"entity-icon " + kind}>
              {kind === "stations" ? (
                <CircleDot size={18} />
              ) : kind === "places" ? (
                <MapPin size={18} />
              ) : (
                <GitBranch size={18} />
              )}
            </span>
          )}
          <div>
            <b>{item.name[lang]}</b>
            <small>
              {term(kind, lang)}
              {kind !== "places" && " · " + term(item.status, lang)}
            </small>
          </div>
          <span className="mini-lines">
            {item.lineIds?.slice(0, 3).map((id) => (
              <i
                key={id}
                style={{
                  background: lineColor(atlas.lines.find((l) => l.id === id)),
                }}
              />
            ))}
          </span>
          <Chevron size={14} />
        </RecordLink>
      ))}
    </div>
  );
}
export function Overview(
  props: PanelProps & {
    filters: Filters;
    setFilters: (f: Filters) => void;
    query: string;
    setQuery: (q: string) => void;
  },
) {
  const { atlas, lang, filters, setFilters, query, setQuery } = props,
    T = useT(lang);
  const [tab, setTab] = useState<"current" | "future">("current");
  const matches = query.trim() ? search(atlas, query) : [];
  const current = atlas.lines.filter((l) => l.status === "operational"),
    future = atlas.lines.filter((l) => l.status !== "operational");
  return (
    <>
      <div className="overview-intro">
        <div className="overline">
          <span className="overline-bar" />
          {T("نمای کلی شبکه", "NETWORK OVERVIEW")}
        </div>
        <h1>{T("شبکه متروی تهران", "Tehran metro network")}</h1>
        <p>
          {T(
            "خطوط، ایستگاه‌ها و طرح‌های توسعه",
            "Lines, stations and network development",
          )}
        </p>
        <div className="stats">
          {[
            [
              TrainFront,
              atlas.metrics.operationalLines,
              T("خط فعال", "Active lines"),
            ],
            [
              CircleDot,
              atlas.metrics.operationalStations,
              T("ایستگاه فعال", "Active stations"),
            ],
            [
              GitBranch,
              atlas.metrics.futureLines,
              T("خط آینده", "Future lines"),
            ],
          ].map(([Icon, value, label]) => {
            const ItemIcon = Icon as typeof TrainFront;
            return (
              <div key={String(label)}>
                <ItemIcon size={16} />
                <b>{n(Number(value), lang)}</b>
                <small>{String(label)}</small>
              </div>
            );
          })}
        </div>
      </div>
      <div className="sidebar-content">
        <SearchField {...{ lang, query, setQuery }} />
        {query.trim() ? (
          <>
            <h2>
              {T("نتایج جست‌وجو", "Search results")}{" "}
              <em>{n(matches.length, lang)}</em>
            </h2>
            <Results {...props} rows={matches} />
          </>
        ) : (
          <>
            <div className="subheading">
              <h2>
                <Layers size={18} />
                {T("خطوط شبکه", "Network lines")}
              </h2>
              <span className="caption">
                {n(atlas.lines.length, lang)} {T("خط", "lines")}
              </span>
            </div>
            <div
              className="segments"
              role="group"
              aria-label={T("گروه خطوط", "Line group")}
            >
              {(["current", "future"] as const).map((k) => (
                <button
                  key={k}
                  aria-pressed={tab === k}
                  className={tab === k ? "on" : ""}
                  onClick={() => setTab(k)}
                >
                  {k === "current"
                    ? T("در بهره‌برداری", "Operational")
                    : T("توسعه آینده", "Future network")}
                </button>
              ))}
            </div>
            <div className="line-list">
              {(tab === "current" ? current : future).map((line) => {
                const services = atlas.services
                  .filter((s) => s.lineId === line.id)
                  .sort(
                    (a, b) =>
                      (b.stationIds?.length || 0) - (a.stationIds?.length || 0),
                  );
                const seq = services[0]?.stationIds || [],
                  endpoints = [seq[0], seq.at(-1)]
                    .map(
                      (id) =>
                        atlas.stations.find((s) => s.id === id)?.name[lang],
                    )
                    .filter(Boolean);
                const hidden = filters.hidden.includes(line.id);
                return (
                  <div
                    className={"line-row" + (hidden ? " muted" : "")}
                    key={line.id}
                  >
                    <RecordLink
                      kind="lines"
                      item={line}
                      lang={lang}
                      select={props.select}
                    >
                      <LineBadge {...{ line, lang }} />
                      <span>
                        <b>{line.name[lang]}</b>
                        <small>
                          {endpoints.length === 2
                            ? endpoints.join(" — ")
                            : term(line.status, lang)}
                        </small>
                      </span>
                    </RecordLink>
                    <button
                      className="eye"
                      aria-label={
                        T("نمایش روی نقشه", "Show on map") +
                        " · " +
                        line.name[lang]
                      }
                      aria-pressed={!hidden}
                      onClick={() =>
                        setFilters({
                          ...filters,
                          hidden: hidden
                            ? filters.hidden.filter((x) => x !== line.id)
                            : [...filters.hidden, line.id],
                        })
                      }
                    >
                      {hidden ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </>
  );
}
export function SourceList({
  atlas,
  lang,
  ids,
}: {
  atlas: Atlas;
  lang: Lang;
  ids: string[];
}) {
  const sources = atlas.sources.filter((s) => ids.includes(s.id));
  return (
    <div className="source-list">
      {sources.map((s) => (
        <a key={s.id} href={s.url} target="_blank" rel="noreferrer">
          <FileText size={17} />
          <span>
            <b dir="auto">{tr(s.name || s.title, lang)}</b>
            <small dir="auto">
              {tr(s.publisher, lang)}
              {s.published ? " · " + date(s.published, lang) : ""}
            </small>
          </span>
          <ExternalLink size={14} />
        </a>
      ))}
    </div>
  );
}
export function Detail(
  props: PanelProps & { choice: Choice; back: () => void },
) {
  const { atlas, lang, choice } = props,
    T = useT(lang),
    r = atlas[choice.kind].find((x) => x.id === choice.id),
    Back = lang === "fa" ? ArrowRight : ArrowLeft;
  if (!r)
    return (
      <div className="sidebar-content">
        <button className="back" onClick={props.back}>
          <Back />
          {T("شبکه", "Network")}
        </button>
        <h2>{T("رکورد پیدا نشد", "Record not found")}</h2>
      </div>
    );
  const line = choice.kind === "lines",
    p = point(r),
    statuses = choice.kind !== "places";
  const services = line
    ? atlas.services.filter((s) => s.lineId === r.id && s.stationIds?.length)
    : [];
  const planned = atlas.services.filter(
    (s) =>
      s.stationId &&
      (line
        ? s.lineId === r.id
        : choice.kind === "stations" && s.stationId === r.id),
  );
  const otherStations = line
    ? atlas.stations.filter(
        (s) =>
          s.lineIds.includes(r.id) &&
          !services.some((sv) => sv.stationIds?.includes(s.id)),
      )
    : [];
  const track = line
    ? atlas.segments.filter((s) => s.lineIds.includes(r.id) && s.geometry)
    : [];
  const alternatives =
    choice.kind === "projects"
      ? atlas.alternatives.filter((a) => a.projectId === r.id)
      : [];
  const nearby = choice.kind === "places" ? closest(atlas, r) : [];
  const val = (v: string | null | undefined) =>
    v || T("ثبت نشده", "Unrecorded");
  const expected =
    typeof r.expected === "string"
      ? date(r.expected, lang)
      : r.expected
        ? [r.expected.start, r.expected.end]
            .filter(Boolean)
            .map((d) => date(d, lang))
            .join(" – ")
        : null;
  return (
    <div className="detail">
      <button className="back" onClick={props.back}>
        <Back size={16} />
        {T("نمای کلی شبکه", "Network overview")}
      </button>
      <div className="detail-title">
        <div className="overline">{term(choice.kind, lang)}</div>
        <h1>
          {line && <LineBadge line={r} lang={lang} />} {r.name[lang]}
        </h1>
        <p lang={lang === "fa" ? "en" : "fa"}>
          {r.name[lang === "fa" ? "en" : "fa"]}
        </p>
      </div>
      {!!r.lineIds?.length && !line && (
        <div className="chips">
          {r.lineIds.map((id) => {
            const l = atlas.lines.find((x) => x.id === id);
            return l ? (
              <RecordLink
                key={id}
                kind="lines"
                item={l}
                lang={lang}
                select={props.select}
              >
                <LineBadge line={l} lang={lang} />
                {l.name[lang]}
              </RecordLink>
            ) : null;
          })}
        </div>
      )}
      <dl className="facts">
        {statuses && (
          <>
            <dt>{T("وضعیت", "Status")}</dt>
            <dd>{term(r.status, lang)}</dd>
          </>
        )}
        <dt>{T("اطمینان مکانی", "Location confidence")}</dt>
        <dd>
          {track.length
            ? [...new Set(track.map((s) => term(s.confidence, lang)))].join(
                " / ",
              )
            : term(r.confidence, lang)}
        </dd>
        {r.constructionStatus && r.constructionStatus !== "unknown" && (
          <>
            <dt>{T("وضعیت ساخت", "Construction status")}</dt>
            <dd>{term(r.constructionStatus, lang)}</dd>
          </>
        )}
        {choice.kind === "stations" && (
          <>
            <dt>{T("افتتاح", "Opened")}</dt>
            <dd>{date(r.opened, lang)}</dd>
          </>
        )}
        {statuses && r.status !== "operational" && (
          <>
            <dt>{T("افتتاح پیش‌بینی‌شده", "Expected opening")}</dt>
            <dd>{val(expected)}</dd>
          </>
        )}
        {p && (
          <>
            <dt>{T("مختصات مرجع", "Reference coordinates")}</dt>
            <dd dir="ltr">
              {p[1].toFixed(5)}, {p[0].toFixed(5)}
            </dd>
          </>
        )}
        {r.lastVerified && (
          <>
            <dt>{T("آخرین بررسی", "Last reviewed")}</dt>
            <dd>{date(r.lastVerified, lang)}</dd>
          </>
        )}
      </dl>
      {!r.geometry &&
        !(
          line &&
          atlas.segments.some((s) => s.lineIds.includes(r.id) && s.geometry)
        ) && (
          <p className="note">
            <MapPin size={17} />
            {T(
              "هندسهٔ قابل انتشار برای این رکورد ثبت نشده است.",
              "No publishable geometry is recorded for this feature.",
            )}
          </p>
        )}
      {r.notes && <p className="prose">{tr(r.notes, lang)}</p>}
      {r.aliases && r.aliases.length > 0 && (
        <p className="small-copy">
          {T("نام‌های دیگر", "Other names")} · {r.aliases.join("، ")}
        </p>
      )}
      {nearby.length > 0 && (
        <>
          <h2>{T("ایستگاه‌های نزدیک", "Nearby stations")}</h2>
          <p className="small-copy">
            {T(
              "فاصلهٔ مستقیم از نقطهٔ مرجع مکان.",
              "Straight-line distance from the mapped reference point.",
            )}
          </p>
          {nearby.map(({ item, km }) => (
            <RecordLink
              key={item.id}
              className="nearby"
              kind="stations"
              item={item}
              lang={lang}
              select={props.select}
            >
              <span>{item.name[lang]}</span>
              <b>
                {n(km, lang)} {T("کیلومتر", "km")}
              </b>
            </RecordLink>
          ))}
        </>
      )}
      {track.length > 0 && (
        <p className="note">
          <Waypoints size={17} />
          {n(track.length, lang)}{" "}
          {T(
            "بخش مسیر مسافری بر پایهٔ هندسهٔ ریل در OpenStreetMap.",
            "passenger segments traced along mapped OpenStreetMap tracks.",
          )}
        </p>
      )}
      {alternatives.map((a) => (
        <article className="service" key={a.id}>
          <h3>{a.name[lang]}</h3>
          <p className="small-copy">
            {term(a.status, lang)} · {term(a.confidence, lang)}
          </p>
          <p className="prose">{tr(a.notes, lang)}</p>
          <SourceList atlas={atlas} lang={lang} ids={a.sourceIds} />
        </article>
      ))}
      {!!r.osmRefs?.length && (
        <a
          className="osm-permalink"
          href={"https://www.openstreetmap.org/" + r.osmRefs[0]}
          target="_blank"
          rel="noreferrer"
        >
          <MapPin size={15} />
          {T(
            "مشاهدهٔ عارضه در OpenStreetMap",
            "View geographic source in OpenStreetMap",
          )}
        </a>
      )}
      {r.sourceIds?.length > 0 && (
        <>
          <h2>
            <BookOpen size={17} />
            {T("شواهد و منابع", "Evidence and sources")}
          </h2>
          <SourceList atlas={atlas} lang={lang} ids={r.sourceIds} />
        </>
      )}
      {planned.length > 0 && (
        <>
          <h2>{T("سرویس‌های آینده", "Future services")}</h2>
          {planned.map((s) => {
            const kind = line ? "stations" : "lines",
              item = atlas[kind].find(
                (x) => x.id === (line ? s.stationId : s.lineId),
              );
            return item ? (
              <div key={s.id}>
                <RecordLink
                  {...props}
                  kind={kind}
                  item={item}
                  className="nearby"
                >
                  <span>{item.name[lang]}</span>
                  <small>{term(s.status, lang)}</small>
                </RecordLink>
              </div>
            ) : null;
          })}
        </>
      )}
      {services.map((sv) => (
        <details className="service" key={sv.id}>
          <summary>
            {sv.name?.[lang] || T("ترتیب ایستگاه‌ها", "Station order")}{" "}
            <em>{n(sv.stationIds?.length || 0, lang)}</em>
          </summary>
          <ol>
            {sv.stationIds?.map((id, i) => {
              const s = atlas.stations.find((x) => x.id === id);
              return s ? (
                <li key={id + i}>
                  <RecordLink {...props} kind="stations" item={s}>
                    {s.name[lang]}
                  </RecordLink>
                </li>
              ) : null;
            })}
          </ol>
        </details>
      ))}
      {otherStations.length > 0 && (
        <>
          <h2>{T("ایستگاه‌های ثبت‌شده", "Recorded stations")}</h2>
          <Results
            {...props}
            rows={otherStations.map((item) => ({ kind: "stations", item }))}
          />
        </>
      )}
    </div>
  );
}
export function Directory(props: PanelProps) {
  const [kind, setKind] = useState<EntityKind>("stations"),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState(""),
    { atlas, lang } = props,
    T = useT(lang);
  const list = search(atlas, query).filter(
    (x) => x.kind === kind && (!status || x.item.status === status),
  );
  return (
    <>
      <PageTitle
        icon={<Waypoints />}
        title={T("فهرست شبکه", "Network directory")}
        desc={T(
          "جست‌وجو در تمام رکوردها، از جمله مکان‌های بدون مختصات.",
          "Browse every reviewed record, including features without coordinates.",
        )}
      />
      <div className="directory-toolbar">
        <SearchField {...{ query, setQuery, lang }} />
        <select
          aria-label={T("فیلتر وضعیت", "Filter by status")}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">{T("همه وضعیت‌ها", "All statuses")}</option>
          {[...new Set(atlas[kind].map((r) => r.status))].map((s) => (
            <option key={s} value={s}>
              {term(s, lang)}
            </option>
          ))}
        </select>
      </div>
      <div className="directory-tabs">
        {kinds.map((k) => (
          <button
            key={k}
            aria-pressed={kind === k}
            onClick={() => {
              setKind(k);
              setStatus("");
            }}
          >
            {term(k, lang)} <em>{n(atlas[k].length, lang)}</em>
          </button>
        ))}
      </div>
      <div className="directory-grid">
        <Results {...props} rows={list} />
      </div>
    </>
  );
}
function PageTitle({
  title,
  desc,
  icon,
}: {
  title: string;
  desc: string;
  icon: React.ReactNode;
}) {
  return (
    <header className="page-title">
      <span>{icon}</span>
      <h1>{title}</h1>
      <p>{desc}</p>
    </header>
  );
}
export function Timeline(props: PanelProps) {
  const { atlas, lang } = props,
    T = useT(lang);
  return (
    <>
      <PageTitle
        icon={<Clock3 />}
        title={T("گاه‌شمار توسعه", "Development timeline")}
        desc={T(
          "رویدادهای دارای تاریخ و منبع در پروندهٔ شبکه.",
          "Dated milestones with a source in the reviewed network record.",
        )}
      />
      <div className="timeline">
        {[...atlas.history]
          .sort((a, b) => b.date.localeCompare(a.date))
          .map((e) => {
            const kind = kinds.find((k) =>
                atlas[k].some((r) => r.id === e.entityId),
              ),
              record = kind && atlas[kind].find((r) => r.id === e.entityId);
            return (
              <article key={e.id}>
                <time dateTime={e.date}>
                  <CalendarDays size={15} />
                  {date(e.date, lang)}
                </time>
                <h2>
                  {tr(e.title || e.name, lang) ||
                    record?.name[lang] ||
                    term(e.status, lang)}
                </h2>
                {e.status && <p>{term(e.status, lang)}</p>}
                {e.notes &&
                  tr(e.notes, lang) !== tr(e.name || e.title, lang) && (
                    <p>{tr(e.notes, lang)}</p>
                  )}
                {kind && record && (
                  <RecordLink {...props} kind={kind} item={record}>
                    {record.name[lang]} <ArrowUpRight size={14} />
                  </RecordLink>
                )}
                <SourceList atlas={atlas} lang={lang} ids={e.sourceIds} />
              </article>
            );
          })}
      </div>
    </>
  );
}
export function Method({ atlas, lang }: PanelProps) {
  const T = useT(lang),
    m = atlas.metrics;
  const years = new Map<string, number>();
  for (const [key, value] of Object.entries(m.knownOpeningsByDate)) {
    const year = key.slice(0, 4);
    years.set(year, (years.get(year) || 0) + value);
  }
  const details = [
    [
      T("شمارش ایستگاه‌ها", "Counting stations"),
      T(
        "هر ایستگاه تقاطعی یک بار در کل شبکه شمرده می‌شود. شمارش بر پایهٔ رکوردهای دارای وضعیت بهره‌برداری است.",
        "An interchange counts once across the network. Counts use records with operational status.",
      ),
    ],
    [
      T("دقت مسیرها", "Alignment accuracy"),
      T(
        "مسیرهای موجود از داده‌های مکانی OpenStreetMap استخراج شده‌اند. دقت هندسی تونل‌ها متغیر است. مسیرهای بدون مدرک جغرافیایی روی نقشه ترسیم نمی‌شوند.",
        "Mapped passenger tracks come from OpenStreetMap. Underground positional accuracy varies. A feature with insufficient geographical evidence remains in the directory.",
      ),
    ],
    [
      T("تاریخ‌ها و وضعیت", "Dates and status"),
      T(
        "تاریخ اعلام پروژه، شروع ساخت و آغاز جابه‌جایی مسافر جداگانه بررسی می‌شوند. تاریخ افتتاح پیش‌بینی‌شده فقط در صورت وجود مدرک ثبت می‌شود.",
        "An announcement, a construction start and the first day of passenger service are distinct events. Opening forecasts require dated evidence.",
      ),
    ],
    [
      T("پوشش داده‌ها", "Coverage"),
      T(
        "نقشه برای پژوهش و بررسی شبکه است. ورودی‌ها، دسترس‌پذیری، هندسهٔ طرح‌های آینده و سابقهٔ بهره‌برداری پوشش یکسان ندارند. مقادیر نامعلوم بدون عدد نمایش داده می‌شوند.",
        "Coverage varies for entrances, accessibility, future geometry and historical openings. Unknown totals are displayed as unrecorded. This atlas does not supply real-time passenger service information.",
      ),
    ],
  ];
  return (
    <>
      <PageTitle
        icon={<BookOpen />}
        title={T("منابع و روش پژوهش", "Sources and methodology")}
        desc={T(
          "پروژه‌ای مستقل و بدون وابستگی به متروی تهران یا شهرداری تهران.",
          "An independent project, unaffiliated with Tehran Metro or Tehran Municipality.",
        )}
      />
      <div className="method-grid">
        <section>
          {details.map(([h, p]) => (
            <article key={h}>
              <h2>{h}</h2>
              <p>{p}</p>
            </article>
          ))}
        </section>
        <section className="method-stats">
          <h2>{T("پوشش نسخه", "Release coverage")}</h2>
          <dl className="facts">
            {[
              [
                T("ایستگاه‌های در حال ساخت", "Stations under construction"),
                m.stationsUnderConstruction,
              ],
              [T("ایستگاه‌های مصوب", "Approved stations"), m.approvedStations],
              [T("طول شبکه فعال", "Operational length"), m.operationalLengthKm],
              [T("طول شبکه آینده", "Planned length"), m.plannedLengthKm],
              [
                T("طول مسیرهای نقشه‌برداری‌شده", "Mapped passenger paths"),
                m.mappedPassengerLengthKm,
              ],
            ].map(([k, v], i) => (
              <div key={String(k)}>
                <dt>{k}</dt>
                <dd>
                  {typeof v === "number"
                    ? n(v, lang) + (i >= 2 ? " " + T("کیلومتر", "km") : "")
                    : T("نامشخص", "Unknown")}
                </dd>
              </div>
            ))}
          </dl>
          <p>
            {T("تاریخ به‌روزرسانی", "Data updated")} ·{" "}
            {date(atlas.updated, lang)}
          </p>
        </section>
      </div>
      <article className="growth">
        <h2>
          {T("افتتاح‌های دارای تاریخ مستند", "Documented station openings")}
        </h2>
        <p>
          {T(
            "سال میلادی؛ تاریخ افتتاح تأییدشده برای",
            "Gregorian years. Opening dates verified for",
          )}{" "}
          {n(m.operationalStationsWithOpeningDate, lang)} /{" "}
          {n(m.operationalStations, lang)}{" "}
          {T("ایستگاه فعال", "operating stations")}.
        </p>
        <div className="coverage-series">
          {[...years].sort().map(([year, count]) => (
            <div className="coverage-year" key={year}>
              <span
                style={{
                  height: (count / Math.max(...years.values())) * 72 + "px",
                }}
                title={year + " · " + count}
              />
              <small>
                {n(Number(year), lang).replace(/[٬,]/g, "")} · {n(count, lang)}
              </small>
            </div>
          ))}
        </div>
      </article>
      <div className="method-links">
        <a href="https://github.com/sinatabar/tehran-metro-atlas/blob/main/docs/RESEARCH.md">
          {T(
            "گزارش پژوهش و اختلاف منابع",
            "Research inventory and conflicting claims",
          )}
        </a>
        <a href="https://github.com/sinatabar/tehran-metro-atlas/blob/main/DATA_LICENSE.md">
          {T("مجوز داده‌ها", "Data licensing")}
        </a>
        <a href={base + "third-party-notices.txt"}>
          {T("مجوزهای نرم‌افزار", "Software notices")}
        </a>
      </div>
      <h2>
        {T("فهرست منابع", "Source registry")}{" "}
        <em>{n(atlas.sources.length, lang)}</em>
      </h2>
      <SourceList
        atlas={atlas}
        lang={lang}
        ids={atlas.sources.map((s) => s.id)}
      />
    </>
  );
}
export function Downloads({
  atlas,
  lang,
  close,
}: {
  atlas: Atlas;
  lang: Lang;
  close: () => void;
}) {
  const T = useT(lang);
  const [offline, setOffline] = useState<
    "ready" | "saving" | "saved" | "failed"
  >("ready");
  const saveOffline = async () => {
    setOffline("saving");
    try {
      const registration = await navigator.serviceWorker.register(
        base + "offline-worker.js",
        { scope: base },
      );
      if (registration.active) await registration.update();
      const worker = registration.installing || registration.waiting;
      if (worker && worker.state !== "activated")
        await new Promise<void>((resolve, reject) => {
          worker.addEventListener("statechange", () => {
            if (worker.state === "activated") resolve();
            if (worker.state === "redundant") reject(Error());
          });
        });
      await navigator.serviceWorker.ready;
      setOffline("saved");
    } catch {
      setOffline("failed");
    }
  };
  return (
    <>
      <header className="dialog-head">
        <Download />
        <h2>{T("دریافت داده‌ها", "Download data")}</h2>
        <button aria-label={T("بستن", "Close")} onClick={close}>
          <X size={20} />
        </button>
      </header>
      <p>
        {T("نسخهٔ داده‌ها", "Dataset version")} <b dir="ltr">{atlas.version}</b>
      </p>
      {["osm", "research"].map((id) => (
        <section className="download-group" key={id}>
          <h3>
            {id === "osm"
              ? T("داده‌های OpenStreetMap", "OpenStreetMap database")
              : T("پژوهش مستقل", "Independent research")}
          </h3>
          <p>
            {id === "osm"
              ? "© OpenStreetMap contributors · ODbL 1.0"
              : T(
                  "پرونده‌های مستند خطوط و توسعه",
                  "Sourced line and development records",
                )}
          </p>
          <div>
            {["geojson", "kml", "kmz", "csv"].map((ext) => (
              <a
                key={ext}
                download
                href={base + "exports/" + id + "/atlas." + ext}
              >
                <Download size={14} />
                {ext.toUpperCase()}
              </a>
            ))}
          </div>
        </section>
      ))}
      <div className="extra-files">
        <a href={base + "data/context.geojson"} download>
          {T("لایهٔ نقشهٔ پایه", "Basemap GeoJSON")}
        </a>{" "}
        ·{" "}
        <a href={base + "data/context-provenance.json.gz"} download>
          {T("منشأ نقشهٔ پایه", "Basemap provenance")}
        </a>{" "}
        ·{" "}
        <a href={base + "exports/osm/references.json"} download>
          {T("منابع مکانی", "GIS references")}
        </a>{" "}
        ·{" "}
        <a href={base + "exports/research/references.json"} download>
          {T("منابع پژوهش", "Research references")}
        </a>
      </div>
      {import.meta.env.PROD && "serviceWorker" in navigator && (
        <button
          className="offline-action"
          onClick={saveOffline}
          disabled={offline === "saving"}
        >
          {offline === "saved" ? <Check size={15} /> : <Download size={15} />}
          <span aria-live="polite">
            {offline === "saved"
              ? T("نسخهٔ آفلاین آماده است", "Offline copy ready")
              : offline === "saving"
                ? T("در حال ذخیره…", "Saving…")
                : offline === "failed"
                  ? T("ذخیره انجام نشد؛ تلاش دوباره", "Could not save. Retry")
                  : T(
                      "ذخیرهٔ اطلس برای استفادهٔ آفلاین",
                      "Save atlas for offline use",
                    )}
          </span>
        </button>
      )}
      <p className="small-copy">
        {T(
          "رکوردهای بدون مختصات در فهرست و CSV نیز در دسترس هستند.",
          "The directory and CSV include records without known coordinates.",
        )}
      </p>
    </>
  );
}
