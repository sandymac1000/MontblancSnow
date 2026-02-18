// Vercel Serverless Function — /api/snow-combloux
// Scrapes skiinfo.fr/alpes-du-nord/combloux/bulletin-neige (official resort data)
// Combloux.com returns 403 to server-side requests, so we use skiinfo which
// receives data directly from the resort's piste service.

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=3600");

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);

    const resp = await fetch("https://www.skiinfo.fr/alpes-du-nord/combloux/bulletin-neige", {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SnowDashboard/1.0)",
        "Accept": "text/html",
        "Accept-Language": "fr-FR,fr;q=0.9",
      },
    });
    clearTimeout(timer);

    if (!resp.ok) throw new Error(`skiinfo returned HTTP ${resp.status}`);

    const html = await resp.text();
    if (html.length < 500) throw new Error("Response too short");

    const data = parseSkiinfo(html);
    data.fetchedAt = new Date().toISOString();
    data.source = "skiinfo.fr (official resort data)";

    return res.status(200).json(data);
  } catch (err) {
    const msg = err.name === "AbortError" ? "Timeout" : err.message;
    return res.status(502).json({ error: msg, fetchedAt: new Date().toISOString() });
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

function parseSkiinfo(html) {
  const text = stripHTML(html);
  const result = { resort: "combloux", areas: [] };

  // Snow depths: "En bas 116cm" "En haut 190cm"
  const baseSnow = text.match(/En\s+bas\s+(\d+)\s*cm/i);
  const topSnow = text.match(/En\s+haut\s+(\d+)\s*cm/i);

  // Snow quality after the depth
  const baseQuality = text.match(/En\s+bas\s+\d+\s*cm\s+([A-Za-zéèêëàâôûùïîç\s]+?)(?=En\s+haut|Hauteur|Remontée|$)/i);
  const topQuality = text.match(/En\s+haut\s+\d+\s*cm\s+([A-Za-zéèêëàâôûùïîç\s]+?)(?=Hauteur|Remontée|Piste|$)/i);

  // Lifts: "Remontées ouvertes 20/22 ouvert"
  const liftsMatch = text.match(/Remont[ée]*s?\s+ouvertes?\s+(\d+)\s*\/\s*(\d+)/i);

  // Slopes: "Pistes ouvertes 60/61 ouvert"
  const slopesMatch = text.match(/Pistes?\s+ouvertes?\s+(\d+)\s*\/\s*(\d+)/i);

  // Recent snowfall table: "24h" column is last
  // "mer. jeu. ven. sam. dim. 24h" followed by amounts
  const recentSnow = text.match(/24h\s+(\d+)\s*cm/i);

  // Forecast snow
  const forecastMatch = text.match(/lun\.\s+(\d+)\s*cm.*?mar\.\s+(\d+)\s*cm.*?mer\.\s+(\d+)\s*cm/i);

  // Slope breakdown
  const greenMatch = text.match(/vertes?\s+ouvertes?\s+(\d+)\s*\/\s*(\d+)/i);
  const blueMatch = text.match(/bleues?\s+ouvertes?\s+(\d+)\s*\/\s*(\d+)/i);
  const redMatch = text.match(/rouges?\s+ouvertes?\s+(\d+)\s*\/\s*(\d+)/i);
  const blackMatch = text.match(/noires?\s+ouvertes?\s+(\d+)\s*\/\s*(\d+)/i);

  // Status: "Combloux: Ouverte" or "Fermée"
  const statusMatch = text.match(/Combloux\s*:\s*(Ouverte|Ferm[ée]*e)/i);
  const isOpen = statusMatch ? /ouverte/i.test(statusMatch[1]) : true;

  // Last update date
  const updateMatch = text.match(/mise\s+[àa]\s+jour\s*:\s*(\d+\s+[a-zéû]+\.?)/i);

  // Snow quality translation
  function translateQuality(q) {
    if (!q) return "—";
    const l = q.trim().toLowerCase();
    if (l.includes("poudreuse") || l.includes("powder")) return "Powder";
    if (l.includes("fraîche") || l.includes("fresh")) return "Fresh";
    if (l.includes("humide") || l.includes("wet")) return "Wet";
    if (l.includes("damée") || l.includes("packed") || l.includes("groomed")) return "Groomed/Packed";
    if (l.includes("dure") || l.includes("hard") || l.includes("glacée") || l.includes("icy")) return "Hard/Icy";
    if (l.includes("printemps") || l.includes("spring")) return "Spring snow";
    return q.trim();
  }

  const quality = translateQuality(topQuality?.[1] || baseQuality?.[1]);

  result.areas.push({
    name: "Combloux–Portes du Mont-Blanc",
    alt: "1930m",
    resort: "combloux",
    snow: topSnow ? topSnow[1] + "cm" : "—",
    snowBase: baseSnow ? baseSnow[1] + "cm" : "—",
    quality,
    fresh: recentSnow ? recentSnow[1] + "cm" : "0cm",
    liftsOpen: liftsMatch ? parseInt(liftsMatch[1]) : null,
    liftsTotal: liftsMatch ? parseInt(liftsMatch[2]) : null,
    slopesOpen: slopesMatch ? parseInt(slopesMatch[1]) : null,
    slopesTotal: slopesMatch ? parseInt(slopesMatch[2]) : null,
    slopeBreakdown: {
      green: greenMatch ? `${greenMatch[1]}/${greenMatch[2]}` : null,
      blue: blueMatch ? `${blueMatch[1]}/${blueMatch[2]}` : null,
      red: redMatch ? `${redMatch[1]}/${redMatch[2]}` : null,
      black: blackMatch ? `${blackMatch[1]}/${blackMatch[2]}` : null,
    },
    forecastSnow: forecastMatch ? { mon: forecastMatch[1] + "cm", tue: forecastMatch[2] + "cm", wed: forecastMatch[3] + "cm" } : null,
    isOpen,
    lastUpdate: updateMatch ? updateMatch[1] : null,
    isClosed: !isOpen,
  });

  return result;
}
