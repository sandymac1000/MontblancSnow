// Vercel Serverless Function — /api/forecast
// Per-resort 6-day forecasts from Open-Meteo (free, no API key)
// Each resort gets its own forecast at the correct lat/lon/elevation

const RESORTS = [
  { id: "chamonix",        lat: 45.9237, lon: 6.8694, elev: 2400, name: "Chamonix" },
  { id: "vallorcine",      lat: 45.9833, lon: 6.8500, elev: 1800, name: "Vallorcine" },
  { id: "saint-gervais",   lat: 45.8917, lon: 6.7125, elev: 1600, name: "Saint-Gervais" },
  { id: "les-contamines",  lat: 45.8167, lon: 6.7278, elev: 1850, name: "Les Contamines" },
  { id: "combloux",        lat: 45.8944, lon: 6.6389, elev: 1500, name: "Combloux" },
];

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=7200");

  try {
    const results = await Promise.all(RESORTS.map(r => fetchResortForecast(r)));

    const forecasts = {};
    for (const r of results) {
      if (r.ok) forecasts[r.id] = r.data;
    }

    return res.status(200).json({
      forecasts,
      resortCount: Object.keys(forecasts).length,
      source: "Open-Meteo",
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(502).json({ error: err.message, fetchedAt: new Date().toISOString() });
  }
}

async function fetchResortForecast(resort) {
  const params = new URLSearchParams({
    latitude: String(resort.lat),
    longitude: String(resort.lon),
    elevation: String(resort.elev),
    daily: [
      "temperature_2m_max", "temperature_2m_min",
      "snowfall_sum", "precipitation_sum",
      "weathercode",
      "windspeed_10m_max", "winddirection_10m_dominant",
    ].join(","),
    timezone: "Europe/Paris",
    forecast_days: "6",
  });

  const url = `https://api.open-meteo.com/v1/forecast?${params}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!resp.ok) return { ok: false, id: resort.id };

    const raw = await resp.json();
    if (!raw.daily?.time) return { ok: false, id: resort.id };

    const d = raw.daily;
    const days = d.time.map((date, i) => ({
      date,
      day: formatDayLabel(date),
      high: Math.round(d.temperature_2m_max[i]) + "°C",
      low: Math.round(d.temperature_2m_min[i]) + "°C",
      snow: formatSnow(d.snowfall_sum[i]),
      rain: d.precipitation_sum[i] > 0.5 ? Math.round(d.precipitation_sum[i]) + "mm" : null,
      wx: weatherCodeToText(d.weathercode[i]),
      windMax: Math.round(d.windspeed_10m_max[i]) + " km/h",
      windDir: degreesToCardinal(d.winddirection_10m_dominant[i]),
    }));

    const totalSnow = d.snowfall_sum.reduce((a, b) => a + (b || 0), 0);
    const maxT = Math.max(...d.temperature_2m_max);
    const minT = Math.min(...d.temperature_2m_min);
    const snowDays = d.snowfall_sum.filter(s => s > 1).length;

    let summary = "";
    if (totalSnow > 30) summary = `Heavy snow — ~${Math.round(totalSnow)}cm over ${snowDays} days.`;
    else if (totalSnow > 10) summary = `Moderate snow — ~${Math.round(totalSnow)}cm.`;
    else if (totalSnow > 2) summary = `Light snow — ~${Math.round(totalSnow)}cm.`;
    else summary = "Mostly dry.";
    summary += ` ${minT}°C to ${maxT}°C.`;

    return {
      ok: true,
      id: resort.id,
      data: { days, summary, elevation: resort.elev + "m", name: resort.name },
    };
  } catch (e) {
    return { ok: false, id: resort.id };
  }
}

function formatDayLabel(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return days[d.getDay()] + " " + d.getDate();
}

function formatSnow(cm) {
  if (!cm || cm < 0.1) return "0";
  return Math.round(cm) + "cm";
}

function degreesToCardinal(deg) {
  if (deg == null) return "";
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(deg / 45) % 8];
}

function weatherCodeToText(code) {
  const map = {
    0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
    45: "Fog", 48: "Rime fog",
    51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle",
    56: "Freezing drizzle", 57: "Heavy freezing drizzle",
    61: "Light rain", 63: "Rain", 65: "Heavy rain",
    66: "Freezing rain", 67: "Heavy freezing rain",
    71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains",
    80: "Light showers", 81: "Showers", 82: "Heavy showers",
    85: "Light snow showers", 86: "Heavy snow showers",
    95: "Thunderstorm", 96: "Thunderstorm + hail", 99: "Thunderstorm + heavy hail",
  };
  return map[code] || "Cloudy";
}
