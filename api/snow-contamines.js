// Vercel Serverless Function — /api/snow-contamines
// Scrapes lescontamines.net/meteo.html + /ouverture.html

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=3600");

  const results = { resort: "les-contamines", areas: [], fetchedAt: new Date().toISOString() };

  try {
    // Fetch both pages in parallel
    const [meteoResp, ouvertureResp] = await Promise.all([
      fetchPage("https://www.lescontamines.net/meteo.html"),
      fetchPage("https://www.lescontamines.net/ouverture.html"),
    ]);

    // Parse meteo page (snow data, weather, avalanche)
    if (meteoResp.ok) {
      const meteo = parseMeteo(meteoResp.html);
      results.meteo = meteo;
    }

    // Parse ouverture page (lifts/slopes open/closed counts)
    if (ouvertureResp.ok) {
      const ouverture = parseOuverture(ouvertureResp.html);
      results.ouverture = ouverture;
    }

    // Build area summary
    const m = results.meteo || {};
    const o = results.ouverture || {};

    results.areas.push({
      name: "Les Contamines–Hauteluce",
      alt: "2500m",
      resort: "les-contamines",
      snow: m.snowTop || "—",
      snowBase: m.snowBase || "—",
      quality: m.snowQuality || "—",
      fresh: m.freshSnow || "0cm",
      freshDetail: m.freshDetail || null,
      tempMorning: m.tempTop || null,
      tempAfternoon: m.tempBase || null,
      avalanche: m.avalancheRisk || null,
      avalancheDetail: m.avalancheDetail || null,
      liftsOpen: o.liftsOpen ?? null,
      liftsTotal: o.liftsTotal ?? null,
      slopesOpen: o.slopesOpen ?? null,
      slopesTotal: o.slopesTotal ?? null,
      wind: m.wind || null,
      weatherReport: m.weatherReport || null,
      messageOfDay: m.messageOfDay || null,
      stationMeasurements: m.stations || [],
      isClosed: o.liftsOpen === 0,
    });

    return res.status(200).json(results);
  } catch (err) {
    return res.status(502).json({ error: err.message, fetchedAt: new Date().toISOString() });
  }
}

async function fetchPage(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SnowDashboard/1.0)", "Accept-Language": "en,fr;q=0.9" },
    });
    clearTimeout(timer);
    if (!resp.ok) return { ok: false, error: `HTTP ${resp.status}` };
    const html = await resp.text();
    return { ok: true, html };
  } catch (e) {
    clearTimeout(timer);
    return { ok: false, error: e.message };
  }
}

function stripHTML(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#?\w+;/g, " ")
    .replace(/\s+/g, " ");
}

function parseMeteo(html) {
  const text = stripHTML(html);
  const result = {};

  // Fresh snow from alert banner: "Fraiche Signal + 39 cm/24H"
  const freshMatches = [];
  const freshRe = /Fraiche\s+(\w+)\s*\+\s*(\d+)\s*cm\s*\/\s*24H/gi;
  let fm;
  while ((fm = freshRe.exec(text)) !== null) {
    freshMatches.push({ station: fm[1], cm: parseInt(fm[2]) });
  }
  if (freshMatches.length > 0) {
    const maxFresh = Math.max(...freshMatches.map(f => f.cm));
    result.freshSnow = maxFresh + "cm";
    result.freshDetail = freshMatches.map(f => `${f.station}: +${f.cm}cm`).join(", ");
  }

  // Avalanche risk: "Risque d'avalanche 4/5" or "4/5 FORT"
  const avMatch = text.match(/(\d)\s*\/\s*5\s*(FORT|MARQU|LIMIT|FAIBLE|TRES\s*FORT)?/i);
  if (avMatch) {
    result.avalancheRisk = avMatch[1] + "/5";
    result.avalancheDetail = avMatch[2] ? avMatch[2].trim() : null;
  }

  // Bulletin neige table: "AIGUILLE 2450m ❄ 290cm 🌡-4,7°C"
  const stations = [];
  // Pattern: STATION_NAME altitude ❄ Ncm optional_fresh 🌡temp optional_wind
  const stationRe = /(AIGUILLE|SIGNAL|RUELLE|ETAPE|VILLAGE|COL\s*du\s*JOLY|TSD\s+Olympique)\s+(\d{3,4})m\s*(.*?)(?=AIGUILLE|SIGNAL|RUELLE|ETAPE|VILLAGE|COL|TSD|$)/gi;
  let sm;
  while ((sm = stationRe.exec(text)) !== null) {
    const name = sm[1].trim();
    const alt = sm[2] + "m";
    const data = sm[3];
    const snowM = data.match(/(\d{2,3})\s*cm/);
    const freshM = data.match(/\+\s*(\d+)\s*cm/);
    const tempM = data.match(/(-?\d+[.,]?\d*)\s*°C/);
    const windM = data.match(/(\w{1,3})\s+(\d+)\s*km\/h/);
    stations.push({
      name, alt,
      snow: snowM ? snowM[1] + "cm" : null,
      fresh: freshM ? "+" + freshM[1] + "cm" : null,
      temp: tempM ? tempM[1].replace(",", ".") + "°C" : null,
      windDir: windM ? windM[1] : null,
      windSpeed: windM ? windM[2] + " km/h" : null,
    });
  }
  result.stations = stations;

  // Extract top/base snow from stations
  const aiguille = stations.find(s => s.name === "AIGUILLE");
  const signal = stations.find(s => s.name === "SIGNAL");
  const etape = stations.find(s => s.name === "ETAPE");
  const village = stations.find(s => s.name === "VILLAGE");

  if (aiguille?.snow) result.snowTop = aiguille.snow;
  else if (signal?.snow) result.snowTop = signal.snow;

  if (etape?.snow) result.snowBase = etape.snow;
  else if (village?.snow) result.snowBase = village.snow;

  if (aiguille?.temp) result.tempTop = aiguille.temp;
  if (etape?.temp) result.tempBase = etape.temp;

  // Snow quality from text
  if (text.match(/poudreuse|powder/i)) result.snowQuality = "Powder";
  else if (text.match(/fraîche|fresh/i)) result.snowQuality = "Fresh";
  else if (text.match(/humide|wet/i)) result.snowQuality = "Wet";
  else if (text.match(/damée|groomed/i)) result.snowQuality = "Groomed";
  else result.snowQuality = "Fresh"; // default during active snowfall

  // Wind from Signal station (most representative mid-mountain)
  if (signal?.windDir && signal?.windSpeed) {
    result.wind = signal.windSpeed + " " + signal.windDir;
  }

  // Weather report
  const wxMatch = text.match(/Vigilance\s*:?\s*([\s\S]{20,500}?)(?=Message du jour|Venir|Bulletin neige)/i);
  if (wxMatch) result.weatherReport = wxMatch[1].trim().substring(0, 400);

  // Message of day
  const msgMatch = text.match(/Message du jour\s+([\s\S]{5,200}?)(?=Venir|Bulletin|$)/i);
  if (msgMatch) result.messageOfDay = msgMatch[1].trim();

  return result;
}

function parseOuverture(html) {
  // Count O.png (open) and F.png (closed) icons for lifts/slopes
  const openCount = (html.match(/icons\/O\.png/g) || []).length;
  const closedCount = (html.match(/icons\/F\.png/g) || []).length;
  const problemCount = (html.match(/icons\/P\.png/g) || []).length;

  const total = openCount + closedCount + problemCount;

  // Les Contamines has ~25 lifts and ~48 slopes = ~73 items
  // The icons on the ouverture page represent both lifts and slopes together
  // We'll estimate: roughly 1/3 lifts, 2/3 slopes
  const liftsTotal = 25; // known from resort info
  const slopesTotal = 48;

  return {
    liftsOpen: Math.round(openCount * (liftsTotal / (liftsTotal + slopesTotal))),
    liftsTotal,
    slopesOpen: Math.round(openCount * (slopesTotal / (liftsTotal + slopesTotal))),
    slopesTotal,
    totalOpen: openCount,
    totalClosed: closedCount,
    totalProblem: problemCount,
    totalItems: total,
  };
}
