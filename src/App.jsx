import { useState, useEffect, useCallback } from "react";

/*
  ╔══════════════════════════════════════════════════════════════╗
  ║  MONT BLANC VALLEY — SNOW DASHBOARD                         ║
  ║  Self-updating via Vercel serverless function /api/snow      ║
  ║  Falls back to snapshot if API unavailable                   ║
  ╚══════════════════════════════════════════════════════════════╝
*/

/* ─── FALLBACK (Feb 16, 2026) ─── */
const FALLBACK = {
  lastUpdated: "Monday 16 February 2026 — 12:30 CET (snapshot)",
  isLive: false,
  dailyReport: "Rain and snow. Westerly winds with gusts near 65 km/h in Mont-Blanc region. Avalanche risk HIGH (4/5).",
  resorts: {
    chamonix: {
      areas: [
        { name: "Brévent", alt: "2525m", snow: "260cm", quality: "Wet snow", fresh: "70cm", temp: "-2°C / 0°C", lifts: "7/12", slopes: "8/20", wind: "40 km/h SW" },
        { name: "Flégère", alt: "2385m", snow: "290cm", quality: "Wet snow", fresh: "60cm", temp: "-5°C / -4°C", lifts: "3/7", slopes: "6/24", wind: "50 km/h E" },
        { name: "Grands Montets", alt: "2765m", snow: "320cm", quality: "Fresh", fresh: "80cm", temp: "-8°C / -6°C", lifts: "2/6", slopes: "8/20", wind: "45 km/h W" },
        { name: "Aiguille du Midi", alt: "3842m", snow: "300cm", quality: "Fresh", fresh: "120cm", temp: "-12°C / -10°C", lifts: "0/3", slopes: "—", wind: "79 km/h W" },
      ],
      avalanche: "4/5", lastSnowfall: "2/16/2026",
    },
    vallorcine: {
      areas: [
        { name: "Balme (Le Tour–Vallorcine)", alt: "2270m", snow: "210cm", quality: "Fresh", fresh: "45cm", temp: "-3°C / -6°C", lifts: "0/9", slopes: "0/27", wind: "11 km/h SW", note: "Closed: bad snow conditions" },
      ],
      avalanche: "4/5", lastSnowfall: "2/16/2026",
    },
    "saint-gervais": {
      areas: [
        { name: "Houches–St Gervais", alt: "1900m", snow: "130cm", quality: "Wet snow", fresh: "35cm", temp: "0°C / 1°C", lifts: "~10/14", slopes: "~30/42", wind: "25 km/h W", note: "snapshot estimate" },
        { name: "Tramway du Mont-Blanc", alt: "1794m", snow: "160cm", quality: "Fresh", fresh: "35cm", temp: "0°C / 0°C", lifts: "CLOSED", slopes: "—", wind: "20 km/h W" },
      ],
      avalanche: "4/5", lastSnowfall: "2/16/2026",
    },
    "les-contamines": {
      areas: [
        { name: "Les Contamines–Hauteluce", alt: "2500m", snow: "220cm top / 80cm base", quality: "Fresh powder", fresh: "~45cm", temp: "-2°C / -1°C", lifts: "~18/24", slopes: "~90/120 km", wind: "30 km/h NW", note: "Snapshot estimate" },
      ],
      avalanche: "4/5", lastSnowfall: "2/16/2026",
    },
    combloux: {
      areas: [
        { name: "Combloux–Megève (EMB)", alt: "1853m", snow: "110cm", quality: "Wet / Fresh above 1500m", fresh: "~25cm", temp: "1°C / 2°C", lifts: "Open (reduced)", slopes: "~40 runs", wind: "20 km/h W", note: "Snapshot estimate" },
      ],
      avalanche: "4/5", lastSnowfall: "2/16/2026",
    },
  },
  forecast: {
    summary: "Major storm Mon 16 dumping 30–120cm. Clearing Tue. Powder above 2000m from Wed. Another system possible late week.",
    days: [
      { day: "Mon 16", high: "0°C", low: "-12°C", wx: "Heavy snow/rain lower", snow: "30–120cm" },
      { day: "Tue 17", high: "-2°C", low: "-10°C", wx: "Clearing, cold NW", snow: "5cm" },
      { day: "Wed 18", high: "-1°C", low: "-8°C", wx: "Partly cloudy", snow: "0" },
      { day: "Thu 19", high: "0°C", low: "-6°C", wx: "Increasing cloud", snow: "0" },
      { day: "Fri 20", high: "-1°C", low: "-7°C", wx: "Snow possible", snow: "5–10cm" },
    ],
  },
};

const RESORTS = [
  { id: "chamonix", name: "Chamonix", el: "1,035 – 3,842m", icon: "🏔️",
    pass: "https://www.passemontagne.fr/",
    cams: [{ l: "Chamonix", u: "https://en.chamonix.com/webcams" }, { l: "MBNR", u: "https://www.montblancnaturalresort.com/en/webcam" }],
    live: "https://www.montblancnaturalresort.com/en/info-live", fc: "https://www.snow-forecast.com/resorts/Chamonix/6day/mid" },
  { id: "vallorcine", name: "Vallorcine (Balme)", el: "1,260 – 2,270m", icon: "🌲",
    pass: "https://www.passemontagne.fr/",
    cams: [{ l: "Balme/Le Tour", u: "https://en.chamonix.com/webcams" }],
    live: "https://www.montblancnaturalresort.com/en/info-live", fc: "https://www.snow-forecast.com/resorts/Chamonix/6day/mid" },
  { id: "saint-gervais", name: "Saint-Gervais", el: "850 – 4,810m", icon: "⛷️",
    pass: "https://www.passemontagne.fr/",
    cams: [{ l: "St-Gervais", u: "https://www.saintgervais.com/hiver/le-domaine-skiable/webcams" }],
    live: "https://www.montblancnaturalresort.com/en/info-live", fc: "https://www.snow-forecast.com/resorts/SaintGervaisMontBlanc/6day/mid" },
  { id: "les-contamines", name: "Les Contamines", el: "1,164 – 2,500m", icon: "❄️",
    pass: "https://www.passemontagne.fr/",
    cams: [{ l: "Les Contamines", u: "https://www.lescontamines.net/webcam.html" }],
    live: "https://www.lescontamines.net/ouverture.html", fc: "https://www.snow-forecast.com/resorts/Les-Contamines/6day/mid" },
  { id: "combloux", name: "Combloux", el: "1,000 – 1,853m", icon: "🎿",
    pass: "https://www.passemontagne.fr/",
    cams: [{ l: "Combloux", u: "https://www.combloux.com/webcams-live" }],
    live: "https://www.combloux.com", fc: "https://www.snow-forecast.com/resorts/Combloux/6day/mid" },
];

/* ─── MERGE API DATA ─── */
function mergeMainData(apiData, base) {
  const out = base;
  if (apiData.dailyReport && apiData.dailyReport !== "No daily report found") {
    out.dailyReport = apiData.dailyReport;
  }
  const grouped = {};
  for (const a of (apiData.areas || [])) {
    const rid = a.resort;
    if (!rid || !out.resorts[rid]) continue;
    if (!grouped[rid]) grouped[rid] = [];
    const isClosed = a.isClosed || a.liftsOpen === 0;
    grouped[rid].push({
      name: a.name, alt: a.alt, snow: a.snow || "—",
      quality: a.quality || "—", fresh: a.fresh || "0cm",
      temp: `${a.tempMorning || "?"} / ${a.tempAfternoon || "?"}`,
      lifts: (a.liftsOpen != null && a.liftsTotal != null) ? `${a.liftsOpen}/${a.liftsTotal}` : (isClosed ? "CLOSED" : ""),
      slopes: (a.slopesOpen != null && a.slopesTotal != null) ? `${a.slopesOpen}/${a.slopesTotal}` : "",
      wind: a.wind || "", visibility: a.visibility || "",
      note: isClosed ? (a.closureReason || "Closed today") : "",
    });
  }
  for (const [rid, areas] of Object.entries(grouped)) {
    if (!out.resorts[rid]) continue;
    out.resorts[rid].areas = areas;
    const av = apiData.areas.find(a => a.resort === rid && a.avalanche);
    if (av) out.resorts[rid].avalanche = av.avalanche;
    const ls = apiData.areas.find(a => a.resort === rid && a.lastSnowfall);
    if (ls) out.resorts[rid].lastSnowfall = ls.lastSnowfall;
  }
  if (apiData.closureNotices?.length > 0) out.closureNotices = apiData.closureNotices;
  return out;
}

function mergeContaminesData(apiData, base) {
  const out = base;
  const a = (apiData.areas || [])[0];
  if (!a) return out;
  const isClosed = a.isClosed || a.liftsOpen === 0;
  const snowDisplay = a.snowBase ? `${a.snow} (top) / ${a.snowBase} (base)` : a.snow;
  const freshDisplay = a.freshDetail || a.fresh;
  out.resorts["les-contamines"] = {
    areas: [{
      name: a.name, alt: a.alt, snow: snowDisplay || "—",
      quality: a.quality || "—", fresh: freshDisplay || "0cm",
      temp: `${a.tempMorning || "?"} / ${a.tempAfternoon || "?"}`,
      lifts: (a.liftsOpen != null && a.liftsTotal != null) ? `${a.liftsOpen}/${a.liftsTotal}` : (isClosed ? "CLOSED" : ""),
      slopes: (a.slopesOpen != null && a.slopesTotal != null) ? `${a.slopesOpen}/${a.slopesTotal}` : "",
      wind: a.wind || "",
      note: a.messageOfDay || (isClosed ? "Closed today" : ""),
    }],
    avalanche: a.avalanche || null,
    lastSnowfall: null,
    stationDetail: a.stationMeasurements || [],
  };
  // Add weather report to daily report if we have it
  if (a.weatherReport && !out.contaminesWeather) {
    out.contaminesWeather = a.weatherReport;
  }
  return out;
}

function mergeComblouxData(apiData, base) {
  const out = base;
  const a = (apiData.areas || [])[0];
  if (!a) return out;
  const isClosed = a.isClosed;
  const snowDisplay = a.snowBase ? `${a.snow} (top) / ${a.snowBase} (base)` : a.snow;
  out.resorts["combloux"] = {
    areas: [{
      name: a.name, alt: a.alt, snow: snowDisplay || "—",
      quality: a.quality || "—", fresh: a.fresh || "0cm",
      temp: "— / —",
      lifts: (a.liftsOpen != null && a.liftsTotal != null) ? `${a.liftsOpen}/${a.liftsTotal}` : (isClosed ? "CLOSED" : "Open"),
      slopes: (a.slopesOpen != null && a.slopesTotal != null) ? `${a.slopesOpen}/${a.slopesTotal}` : "",
      wind: "",
      note: a.slopeBreakdown ? `🟢${a.slopeBreakdown.green || "?"} 🔵${a.slopeBreakdown.blue || "?"} 🔴${a.slopeBreakdown.red || "?"} ⚫${a.slopeBreakdown.black || "?"}` : "",
    }],
    avalanche: null,
    lastSnowfall: a.lastUpdate || null,
  };
  return out;
}

async function fetchEndpoint(path) {
  try {
    const resp = await fetch(path);
    if (!resp.ok) return { ok: false, error: `HTTP ${resp.status}` };
    const data = await resp.json();
    if (data.error) return { ok: false, error: data.error };
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/* ─── UI ─── */
function wxI(c) {
  if (!c) return "🌤️";
  const d = c.toLowerCase();
  return d.includes("heavy snow") ? "❄️" : d.includes("snow") ? "🌨️" : d.includes("rain") ? "🌧️" :
    d.includes("clearing") ? "🌤️" : d.includes("cloud") || d.includes("overcast") ? "☁️" :
    d.includes("partly") || d.includes("increas") ? "⛅" : d.includes("sun") || d.includes("clear") ? "☀️" : "🌤️";
}

function Bar({ label, value, max = 350 }) {
  const n = parseInt(String(value || "0").replace(/[^\d]/g, "")) || 0;
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#8ba4c4", marginBottom: 2, fontFamily: "var(--f)" }}>
        <span>{label}</span><span style={{ color: "#d4e3f5", fontWeight: 600 }}>{value || "—"}</span>
      </div>
      <div style={{ height: 5, background: "rgba(255,255,255,0.05)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.min((n / max) * 100, 100)}%`, background: "linear-gradient(90deg,#4a9eff,#7c6aef)", borderRadius: 3, transition: "width 1s ease" }} />
      </div>
    </div>
  );
}

function Pill({ children, color = "#8ba4c4", bg = "rgba(100,140,200,0.06)" }) {
  return <span style={{ display: "inline-block", background: bg, border: `1px solid ${color}22`, borderRadius: 6, padding: "3px 7px", fontSize: 10, color, fontFamily: "var(--f)", fontWeight: 600, marginRight: 4, marginBottom: 3 }}>{children}</span>;
}

function AreaBlock({ area }) {
  const closed = String(area.lifts || "").toUpperCase().includes("CLOSED") || /^0\//.test(area.lifts || "");
  return (
    <div style={{ background: closed ? "rgba(239,68,68,0.03)" : "rgba(255,255,255,0.015)", borderRadius: 10, padding: "10px 12px", marginBottom: 6, border: `1px solid ${closed ? "rgba(239,68,68,0.08)" : "rgba(255,255,255,0.03)"}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: closed ? "#f87171" : "#d4e3f5", fontFamily: "var(--f)" }}>{closed && "🔴 "}{area.name}</span>
        <span style={{ fontSize: 10, color: "#4a6a8e", fontFamily: "var(--f)" }}>{area.alt}</span>
      </div>
      <Bar label="Snow depth" value={area.snow} />
      {parseInt(String(area.fresh || "0").replace(/[^\d]/g, "")) > 0 && <Bar label="Fresh snow" value={area.fresh} max={150} />}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 4 }}>
        <Pill color="#a594f9" bg="rgba(124,106,239,0.08)">❄️ {area.quality}</Pill>
        {area.lifts && <Pill color={closed ? "#f87171" : "#4ade80"} bg={closed ? "rgba(239,68,68,0.06)" : "rgba(34,197,94,0.06)"}>🚡 {area.lifts}</Pill>}
        {area.slopes && area.slopes !== "—" && area.slopes !== "" && <Pill color={closed ? "#f87171" : "#38bdf8"} bg={closed ? "rgba(239,68,68,0.06)" : "rgba(56,189,248,0.06)"}>⛷️ {area.slopes}</Pill>}
        <Pill>🌡️ {area.temp}</Pill>
        {area.wind && <Pill>💨 {area.wind}</Pill>}
        {area.visibility && <Pill>👁 {area.visibility}</Pill>}
      </div>
      {area.note && <p style={{ margin: "4px 0 0", fontSize: 9, color: "#6b8ab5", fontFamily: "var(--f)", fontStyle: "italic" }}>ℹ️ {area.note}</p>}
    </div>
  );
}

function ForecastStrip({ days }) {
  return (
    <div style={{ display: "flex", gap: 3 }}>
      {days.map((d, i) => {
        const hasSnow = d.snow && !["0", "0cm", ""].includes(String(d.snow).trim());
        return (
          <div key={i} style={{ flex: 1, background: "rgba(255,255,255,0.02)", borderRadius: 9, padding: "7px 3px", textAlign: "center", border: "1px solid rgba(255,255,255,0.03)", minWidth: 50 }}>
            <div style={{ fontSize: 9, color: "#6b8ab5", fontFamily: "var(--f)", fontWeight: 700, marginBottom: 2 }}>{d.day}</div>
            <div style={{ fontSize: 18, lineHeight: 1, marginBottom: 1 }}>{wxI(d.wx)}</div>
            <div style={{ fontSize: 8, color: "#5a7a9e", fontFamily: "var(--f)", lineHeight: 1.15, minHeight: 16 }}>{d.wx}</div>
            <div style={{ fontSize: 11, color: "#d4e3f5", fontWeight: 700, fontFamily: "var(--f)" }}>{d.high}</div>
            <div style={{ fontSize: 9, color: "#4a6a8e" }}>{d.low}</div>
            {hasSnow && <div style={{ fontSize: 8, color: "#7c6aef", fontWeight: 700, marginTop: 2, background: "rgba(124,106,239,0.12)", borderRadius: 4, padding: "1px 3px", fontFamily: "var(--f)" }}>❄ {d.snow}</div>}
          </div>
        );
      })}
    </div>
  );
}

function ResortCard({ r, data, forecast, fallbackForecast, idx }) {
  const d = data || {};
  const fc = forecast || fallbackForecast || {};
  const fcDays = fc.days || [];
  return (
    <div style={{ background: "linear-gradient(145deg, rgba(10,20,40,0.96), rgba(18,32,55,0.92))", backdropFilter: "blur(20px)", border: "1px solid rgba(100,140,200,0.09)", borderRadius: 16, padding: 18, position: "relative", overflow: "hidden", animation: `slideUp 0.45s cubic-bezier(0.22,1,0.36,1) ${idx * 70}ms both` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ fontSize: 22 }}>{r.icon}</span>
            <h3 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: "#e8f0fc", fontFamily: "var(--d)", letterSpacing: "-0.02em" }}>{r.name}</h3>
          </div>
          <p style={{ margin: "2px 0 0 31px", fontSize: 10, color: "#4a6a8e", fontFamily: "var(--f)" }}>{r.el}</p>
        </div>
        {d.avalanche && <div style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 7, padding: "3px 7px", fontSize: 10, color: "#f87171", fontFamily: "var(--f)", fontWeight: 700 }}>⚠ {d.avalanche}</div>}
      </div>
      {(d.areas || []).map((a, i) => <AreaBlock key={i} area={a} />)}
      {d.lastSnowfall && <p style={{ margin: "2px 0 6px", fontSize: 9, color: "#4a6a8e", fontFamily: "var(--f)" }}>Last snowfall: {d.lastSnowfall}</p>}
      {fcDays.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <h4 style={{ margin: 0, fontSize: 9, color: "#4a6a8e", fontFamily: "var(--f)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700 }}>6-Day Forecast</h4>
            {fc.elevation && <span style={{ fontSize: 8, color: forecast ? "#4ade80" : "#4a6a8e", fontFamily: "var(--f)" }}>{forecast ? "🟢" : "📌"} {fc.elevation}</span>}
          </div>
          <ForecastStrip days={fcDays} />
        </div>
      )}
      <div style={{ paddingTop: 8, borderTop: "1px solid rgba(100,140,200,0.06)", display: "flex", flexWrap: "wrap", gap: 5 }}>
        {r.cams.map((c, i) => <a key={i} href={c.u} target="_blank" rel="noopener noreferrer" style={{ padding: "4px 8px", borderRadius: 7, background: "rgba(74,158,255,0.07)", border: "1px solid rgba(74,158,255,0.13)", color: "#4a9eff", fontSize: 9, fontWeight: 600, textDecoration: "none", fontFamily: "var(--f)" }}>📷 {c.l}</a>)}
        <a href={r.live} target="_blank" rel="noopener noreferrer" style={{ padding: "4px 8px", borderRadius: 7, background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.12)", color: "#4ade80", fontSize: 9, fontWeight: 600, textDecoration: "none", fontFamily: "var(--f)" }}>🔴 Live</a>
        <a href={r.pass} target="_blank" rel="noopener noreferrer" style={{ padding: "4px 8px", borderRadius: 7, background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.13)", color: "#fbbf24", fontSize: 9, fontWeight: 600, textDecoration: "none", fontFamily: "var(--f)" }}>🎫 Pass</a>
        <a href={r.fc} target="_blank" rel="noopener noreferrer" style={{ padding: "4px 8px", borderRadius: 7, background: "rgba(100,140,200,0.04)", border: "1px solid rgba(100,140,200,0.1)", color: "#6b8ab5", fontSize: 9, fontWeight: 600, textDecoration: "none", fontFamily: "var(--f)" }}>📊 Forecast</a>
      </div>
    </div>
  );
}

/* ─── MAIN APP ─── */
export default function App() {
  const [data, setData] = useState(FALLBACK);
  const [status, setStatus] = useState("loading"); // loading | live | failed
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setBusy(true); setStatus("loading"); setErr("");
    try {
      // Fetch all 4 endpoints in parallel
      const [main, contam, comblx, fc] = await Promise.all([
        fetchEndpoint("/api/snow"),
        fetchEndpoint("/api/snow-contamines"),
        fetchEndpoint("/api/snow-combloux"),
        fetchEndpoint("/api/forecast"),
      ]);

      let out = JSON.parse(JSON.stringify(FALLBACK));
      const now = new Date();
      let liveCount = 0;
      const failedSources = [];

      if (main.ok) {
        out = mergeMainData(main.data, out);
        liveCount += (main.data.areaCount || main.data.areas?.length || 0);
      } else { failedSources.push("MBNR"); }

      if (contam.ok) {
        out = mergeContaminesData(contam.data, out);
        liveCount++;
      } else { failedSources.push("Contamines"); }

      if (comblx.ok) {
        out = mergeComblouxData(comblx.data, out);
        liveCount++;
      } else { failedSources.push("Combloux"); }

      // Merge per-resort forecasts
      if (fc.ok && fc.data.forecasts) {
        const fcs = fc.data.forecasts;
        out.forecasts = fcs; // store per-resort forecasts
        // Use Chamonix as the valley-wide headline forecast
        if (fcs.chamonix) {
          out.forecast = {
            summary: fcs.chamonix.summary,
            days: fcs.chamonix.days,
            elevation: fcs.chamonix.elevation,
            isLive: true,
          };
        }
      } else { failedSources.push("Forecast"); }

      if (liveCount > 0) {
        out.lastUpdated = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
          + " — " + now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) + " CET (live)";
        out.isLive = true;
        out.areaCount = liveCount;
        out.failedSources = failedSources;
        setData(out);
        setStatus(failedSources.length > 0 ? "partial" : "live");
        if (failedSources.length > 0) setErr(failedSources.join(", ") + " failed");
      } else {
        throw new Error("All sources failed");
      }
    } catch (e) {
      setErr(e.message);
      setStatus("failed");
      setData(FALLBACK);
    }
    setBusy(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const stColor = status === "live" ? "#4ade80" : status === "partial" ? "#38bdf8" : status === "failed" ? "#fbbf24" : "#4a9eff";
  const stBg = status === "live" ? "rgba(34,197,94,0.08)" : status === "partial" ? "rgba(56,189,248,0.08)" : status === "failed" ? "rgba(245,158,11,0.08)" : "rgba(74,158,255,0.08)";
  const stBorder = status === "live" ? "rgba(34,197,94,0.18)" : status === "partial" ? "rgba(56,189,248,0.18)" : status === "failed" ? "rgba(245,158,11,0.18)" : "rgba(74,158,255,0.18)";

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(175deg, #040a18 0%, #0c1628 25%, #121f38 60%, #182848 100%)", color: "#d4e3f5", fontFamily: "var(--f)" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600;700&family=DM+Sans:wght@400;500;600;700&display=swap');
        :root { --d: 'Cormorant Garamond', Georgia, serif; --f: 'DM Sans', -apple-system, sans-serif; }
        @keyframes slideUp { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:translateY(0); } }
        @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
        @keyframes spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
        a:hover { opacity:0.8; } button:hover:not(:disabled) { filter:brightness(1.2); }
        .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(380px,1fr)); gap:14px; }
        @media(max-width:820px) { .grid { grid-template-columns:1fr; } }
      `}</style>

      <div style={{ position: "relative", maxWidth: 1260, margin: "0 auto", padding: "24px 18px 44px" }}>
        <header style={{ textAlign: "center", marginBottom: 20, animation: "fadeIn 0.6s ease both" }}>
          <div style={{ fontSize: 34, marginBottom: 4 }}>🏔️</div>
          <h1 style={{ margin: 0, fontSize: 38, fontWeight: 700, fontFamily: "var(--d)", letterSpacing: "-0.03em", background: "linear-gradient(135deg, #e8f0fc, #6b8ab5)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Mont Blanc Valley</h1>
          <h2 style={{ margin: "2px 0 0", fontSize: 12, fontWeight: 500, color: "#4a6a8e", letterSpacing: "0.18em", textTransform: "uppercase", fontFamily: "var(--f)" }}>Snow Conditions</h2>
          <p style={{ margin: "8px 0 0", fontSize: 10, color: data.isLive ? "#4ade80" : "#3a5a7e", fontFamily: "var(--f)", fontWeight: data.isLive ? 600 : 400 }}>
            {data.isLive ? "🟢" : "📌"} {data.lastUpdated}
          </p>
        </header>

        {/* Status */}
        <div style={{ background: stBg, border: `1px solid ${stBorder}`, borderRadius: 10, padding: "8px 14px", marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <span style={{ fontSize: 11, color: stColor, fontFamily: "var(--f)", fontWeight: 600, flex: 1 }}>
            {status === "loading" && <span style={{ display: "inline-block", animation: "spin 1s linear infinite", marginRight: 4 }}>⟳</span>}
            {status === "loading" ? "🔄 Fetching live data from 3 sources…"
              : status === "live" ? `✅ All live — MBNR + Les Contamines + Combloux`
              : status === "partial" ? `🔵 Partial live — ${err || "some sources"} using snapshot`
              : `⚠️ ${err} — showing Feb 16 snapshot`}
          </span>
          {status !== "loading" && (
            <button onClick={refresh} disabled={busy} style={{
              background: "rgba(74,158,255,0.1)", border: "1px solid rgba(74,158,255,0.2)",
              borderRadius: 6, padding: "4px 10px", color: "#4a9eff", fontSize: 10,
              fontWeight: 700, fontFamily: "var(--f)", cursor: busy ? "wait" : "pointer", opacity: busy ? 0.5 : 1
            }}>🔄 Refresh</button>
          )}
        </div>

        {/* Closure notices */}
        {data.closureNotices && data.closureNotices.length > 0 && (
          <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 12, padding: "10px 16px", marginBottom: 10 }}>
            {data.closureNotices.map((n, i) => (
              <p key={i} style={{ margin: i > 0 ? "4px 0 0" : 0, fontSize: 11, color: "#fbbf24", fontFamily: "var(--f)", fontWeight: 600, lineHeight: 1.4 }}>📢 {n}</p>
            ))}
          </div>
        )}

        {/* Daily alert */}
        <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.18)", borderRadius: 12, padding: "10px 16px", marginBottom: 16 }}>
          <p style={{ margin: 0, fontSize: 12, color: "#fca5a5", fontFamily: "var(--f)", fontWeight: 600, lineHeight: 1.4 }}>⚠️ {data.dailyReport}</p>
        </div>

        {/* Forecast */}
        <div style={{ background: "linear-gradient(145deg, rgba(10,20,40,0.96), rgba(18,32,55,0.92))", border: "1px solid rgba(100,140,200,0.09)", borderRadius: 14, padding: 16, marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#e8f0fc", fontFamily: "var(--d)" }}>🌤️ Valley Overview (Chamonix 2400m)</h3>
            <span style={{ fontSize: 9, color: data.forecast.isLive ? "#4ade80" : "#4a6a8e", fontFamily: "var(--f)", fontWeight: 600 }}>
              {data.forecast.isLive ? "🟢 Open-Meteo" : "📌 Snapshot"} · per-resort forecasts below
            </span>
          </div>
          <p style={{ margin: "0 0 10px", fontSize: 11, color: "#8ba4c4", fontFamily: "var(--f)", lineHeight: 1.35 }}>{data.forecast.summary}</p>
          <ForecastStrip days={data.forecast.days} />
        </div>

        {/* Cards */}
        <div className="grid">
          {RESORTS.map((r, i) => <ResortCard key={r.id} r={r} idx={i} data={data.resorts[r.id]} forecast={data.forecasts?.[r.id] || null} fallbackForecast={data.forecast} />)}
        </div>

        <footer style={{ textAlign: "center", marginTop: 32, paddingTop: 16, borderTop: "1px solid rgba(100,140,200,0.05)" }}>
          <p style={{ fontSize: 10, color: "#4a6a8e", margin: "0 0 10px", fontFamily: "var(--f)" }}>⚠ Always verify with official resort sources before heading out</p>
          <div style={{ display: "flex", justifyContent: "center", gap: 14, flexWrap: "wrap" }}>
            <a href="https://www.passemontagne.fr/" target="_blank" rel="noopener noreferrer" style={{ color: "#fbbf24", fontSize: 11, textDecoration: "none", fontWeight: 600, fontFamily: "var(--f)" }}>🎫 Passemontagne</a>
            <a href="https://www.montblancnaturalresort.com/en/info-live" target="_blank" rel="noopener noreferrer" style={{ color: "#4a9eff", fontSize: 11, textDecoration: "none", fontWeight: 600, fontFamily: "var(--f)" }}>🏔 MBNR Live</a>
            <a href="https://meteofrance.com/meteo-montagne/mont-blanc" target="_blank" rel="noopener noreferrer" style={{ color: "#8ba4c4", fontSize: 11, textDecoration: "none", fontWeight: 600, fontFamily: "var(--f)" }}>🌤 Météo France</a>
          </div>
        </footer>
      </div>
    </div>
  );
}
