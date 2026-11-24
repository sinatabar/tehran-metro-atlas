import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Clock3,
  Download,
  Globe2,
  Map as MapIcon,
  Moon,
  PanelRightClose,
  Sun,
  Waypoints,
} from "lucide-react";
import {
  base,
  date,
  getPath,
  initialFilters,
  pathFor,
  term,
  type Atlas,
  type Choice,
  type Lang,
  type Section,
} from "./model";
import {
  Detail,
  Directory,
  Downloads,
  Method,
  Overview,
  Timeline,
} from "./AtlasPanels";
const NetworkMap = lazy(() => import("./NetworkMap"));
function readTheme() {
  try {
    return localStorage.getItem("atlas-theme") === "dark";
  } catch {
    return false;
  }
}
export default function App({ atlas }: { atlas: Atlas }) {
  const [route, setRoute] = useState(() => getPath(location.pathname)),
    { lang, section, choice } = route;
  const [dark, setDark] = useState(readTheme),
    [filters, setFilters] = useState(initialFilters),
    [query, setQuery] = useState(""),
    [sidebar, setSidebar] = useState(!!choice),
    [download, setDownload] = useState(false);
  const side = useRef<HTMLElement>(null),
    dialog = useRef<HTMLDialogElement>(null),
    closeSidebar = useRef<HTMLButtonElement>(null);
  const fa = lang === "fa",
    T = (f: string, e: string) => (fa ? f : e);
  const open = (l: Lang, s: Section, c: Choice | null = null) => {
    const target = pathFor(l, s, c),
      q = location.search;
    if (target !== location.pathname) history.pushState({}, "", target + q);
    setRoute({ lang: l, section: s, choice: c });
  };
  useEffect(() => {
    const pop = () => {
      const r = getPath(location.pathname);
      setRoute(r);
      setSidebar(!!r.choice);
    };
    addEventListener("popstate", pop);
    return () => removeEventListener("popstate", pop);
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = fa ? "rtl" : "ltr";
    const name = choice
      ? atlas[choice.kind].find((r) => r.id === choice.id)?.name[lang]
      : term(section, lang);
    document.title =
      (name ? name + " | " : "") +
      (fa ? "اطلس متروی تهران" : "Tehran Metro Atlas");
  }, [lang, fa, choice, section, atlas]);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    try {
      localStorage.setItem("atlas-theme", dark ? "dark" : "light");
    } catch {
      /* Embedded views can restrict storage. */
    }
  }, [dark]);
  useEffect(() => {
    if (download) dialog.current?.showModal();
    else if (dialog.current?.open) dialog.current.close();
  }, [download]);
  useEffect(() => {
    side.current?.scrollTo(0, 0);
  }, [choice]);
  useEffect(() => {
    if (sidebar && matchMedia("(max-width: 760px)").matches)
      closeSidebar.current?.focus();
  }, [sidebar]);
  const select = (c: Choice) => {
    open(lang, "map", c);
    setSidebar(true);
  };
  const panelProps = { atlas, lang, select };
  const navItems = [
    [MapIcon, "map"],
    [Waypoints, "directory"],
    [Clock3, "timeline"],
    [BookOpen, "methodology"],
  ] as const;
  return (
    <div className="app">
      <a className="skip" href="#content">
        {T("ورود به محتوا", "Skip to content")}
      </a>
      <header className="topbar">
        <a
          className="brand"
          href={pathFor(lang, "map")}
          onClick={(e) => {
            e.preventDefault();
            open(lang, "map");
            setSidebar(false);
          }}
        >
          <img src={base + "atlas.svg"} width="40" height="40" alt="" />
          <span>
            <b>{T("اطلس متروی تهران", "Tehran Metro Atlas")}</b>
            <small>{T("TEHRAN METRO ATLAS", "اطلس متروی تهران")}</small>
          </span>
        </a>
        <nav aria-label={T("ناوبری اصلی", "Main navigation")}>
          {navItems.map(([Icon, s]) => (
            <a
              key={s}
              aria-current={section === s ? "page" : undefined}
              href={pathFor(lang, s)}
              onClick={(e) => {
                if (e.ctrlKey || e.metaKey) return;
                e.preventDefault();
                open(lang, s);
                setSidebar(false);
              }}
            >
              <Icon size={16} />
              <span>{term(s, lang)}</span>
            </a>
          ))}
        </nav>
        <div className="header-actions">
          <button
            className="icon-btn"
            aria-label={T(
              "تغییر حالت روشن و تیره",
              "Toggle light and dark theme",
            )}
            title={T("تغییر حالت نمایش", "Change theme")}
            onClick={() => setDark(!dark)}
          >
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button
            className="language"
            lang={fa ? "en" : "fa"}
            aria-label={T("English", "فارسی")}
            onClick={() => open(fa ? "en" : "fa", section, choice)}
          >
            <Globe2 size={16} />
            {fa ? "EN" : "فا"}
          </button>
          <button
            className="download-btn"
            onClick={() => setDownload(true)}
            aria-label={T("دریافت داده‌ها", "Download data")}
          >
            <Download size={16} />
            <span>{T("دریافت داده‌ها", "Get data")}</span>
          </button>
        </div>
      </header>
      {section === "map" ? (
        <main className="workspace" id="content">
          <aside
            className={"sidebar" + (sidebar ? " mobile-open" : "")}
            ref={side}
            onKeyDown={(e) => {
              if (e.key === "Escape") setSidebar(false);
            }}
          >
            <div className="mobile-close">
              <button ref={closeSidebar} onClick={() => setSidebar(false)}>
                <PanelRightClose size={16} />
                {T("نمایش نقشه", "Show map")}
              </button>
            </div>
            {choice ? (
              <Detail
                {...panelProps}
                choice={choice}
                back={() => open(lang, "map")}
              />
            ) : (
              <Overview
                {...panelProps}
                {...{ filters, setFilters, query, setQuery }}
              />
            )}
            <div className="sidebar-foot">
              <span className="data-dot" />
              {T("به‌روزرسانی داده‌ها", "Data updated")}
              <time dateTime={atlas.updated}>{date(atlas.updated, lang)}</time>
            </div>
          </aside>
          <Suspense
            fallback={
              <div className="map-placeholder" role="status">
                {T("در حال بارگذاری نقشه…", "Loading map…")}
              </div>
            }
          >
            <NetworkMap
              {...panelProps}
              {...{ dark, filters, setFilters, choice }}
              openDirectory={() => open(lang, "directory")}
              onExplore={() => setSidebar(true)}
            />
          </Suspense>
        </main>
      ) : (
        <main id="content" className="page">
          <div className="page-inner">
            {section === "directory" ? (
              <Directory {...panelProps} />
            ) : section === "timeline" ? (
              <Timeline {...panelProps} />
            ) : (
              <Method {...panelProps} />
            )}
          </div>
        </main>
      )}
      <dialog
        ref={dialog}
        onCancel={() => setDownload(false)}
        onClose={() => setDownload(false)}
        onClick={(e) => {
          if (e.target === dialog.current) {
            const r = dialog.current.getBoundingClientRect();
            if (
              e.clientX < r.left ||
              e.clientX > r.right ||
              e.clientY < r.top ||
              e.clientY > r.bottom
            )
              setDownload(false);
          }
        }}
        aria-label={T("دریافت داده‌ها", "Download data")}
      >
        <Downloads atlas={atlas} lang={lang} close={() => setDownload(false)} />
      </dialog>
    </div>
  );
}
