import { createRoot } from "react-dom/client";
import { useEffect, useState, Component, type ReactNode } from "react";
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/vazirmatn";
import "./style.css";
import App from "./App";
import { base, getPath, type Atlas } from "./model";

function Startup() {
  const [data, setData] = useState<Atlas>();
  const [failed, setFailed] = useState(false);
  const fa = getPath(location.pathname).lang === "fa";
  useEffect(() => {
    const c = new AbortController();
    fetch(base + "data/atlas.json", { signal: c.signal })
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then(setData)
      .catch(() => {
        if (!c.signal.aborted) setFailed(true);
      });
    return () => c.abort();
  }, []);
  if (data) return <App atlas={data} />;
  return (
    <main className="boot" lang={fa ? "fa" : "en"}>
      <img src={base + "atlas.svg"} width="48" height="48" alt="" />
      <h1>{fa ? "اطلس متروی تهران" : "Tehran Metro Atlas"}</h1>
      <p role="status">
        {failed
          ? fa
            ? "دریافت داده‌ها انجام نشد."
            : "The network dataset could not be loaded."
          : fa
            ? "در حال بارگذاری داده‌های شبکه…"
            : "Loading network data…"}
      </p>
      {failed && (
        <button onClick={() => location.reload()}>
          {fa ? "تلاش دوباره" : "Retry"}
        </button>
      )}
    </main>
  );
}
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="boot">
        <h1>اطلس متروی تهران · Tehran Metro Atlas</h1>
        <a href={base + "data/atlas.json"}>داده‌های شبکه · Network dataset</a>
      </main>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")!).render(
  <Boundary>
    <Startup />
  </Boundary>,
);
