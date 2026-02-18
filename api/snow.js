// Vercel Serverless Function — /api/snow
// Fetches montblancnaturalresort.com/en/info-live, parses HTML, returns JSON
// No CORS issues because this runs server-side on Vercel's edge

export default async function handler(req, res) {
  // Allow GET only
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // CORS headers for the frontend
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=3600"); // 30min cache

  const URL = "https://www.montblancnaturalresort.com/en/info-live";

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(URL, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SnowDashboard/1.0)",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-GB,en;q=0.9",
      },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`MBNR returned HTTP ${response.status}`);
    }

    const html = await response.text();
    if (html.length < 1000) {
      throw new Error("Response too short — likely blocked");
    }

    const data = parseHTML(html);
    data.fetchedAt = new Date().toISOString();
    data.source = URL;

    return res.status(200).json(data);
  } catch (err) {
    const msg = err.name === "AbortError" ? "Timeout fetching MBNR" : err.message;
    return res.status(502).json({ error: msg, fetchedAt: new Date().toISOString() });
  }
}

/* ─── HTML PARSER ─── */
function parseHTML(html) {
  // We're in Node.js — no DOMParser. Use regex on the raw text.
  // Strip HTML tags to get plain text
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#?\w+;/g, " ")
    .replace(/\s+/g, " ");

  // Extract the page date
  let pageDate = "";
  const dateMatch = text.match(/(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+([A-Z][a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\d{4})/i);
  if (dateMatch) {
    pageDate = `${dateMatch[1]}, ${dateMatch[2]} ${dateMatch[3]}, ${dateMatch[4]}`;
  }

  // Extract daily report
  let dailyReport = "";
  const drMatch = text.match(/Daily report\s+(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)[^.]*?\d{4}\s+([\s\S]*?)(?=Opening|Lift|$)/i);
  if (drMatch) {
    dailyReport = drMatch[2].trim().substring(0, 300);
  }

  // Also try simpler pattern
  if (!dailyReport) {
    const dr2 = text.match(/Daily report[^A-Z]*([A-Z][\s\S]{20,300}?)(?:\s*Opening|\s*Lift|\s*$)/i);
    if (dr2) dailyReport = dr2[1].trim().substring(0, 300);
  }

  // Split by area headers: "Name - NNNNm" pattern
  // In the stripped HTML, areas appear as sections with altitude markers
  const areas = [];

  // Find all area markers in the original HTML by looking for heading patterns
  // The site uses headings like "Brévent - 2525m", "Flégère - 2385m" etc.
  const areaRegex = /([\wÀ-ÿ][\wÀ-ÿ\s\-()/''.]+?)\s*[-–—]\s*(\d{3,4})\s*m/g;
  const areaMatches = [];
  let m;

  while ((m = areaRegex.exec(text)) !== null) {
    const name = m[1].trim();
    // Filter out noise — area names should be 3-50 chars
    if (name.length >= 3 && name.length <= 60 && !name.match(/^\d/) && !name.match(/^(from|to|max|min|near|at)\s/i)) {
      areaMatches.push({ name, alt: m[2] + "m", index: m.index });
    }
  }

  // Deduplicate (same name can appear multiple times for Today/Tomorrow/etc)
  const seen = new Set();
  const uniqueAreas = [];
  for (const a of areaMatches) {
    const key = a.name.toLowerCase().replace(/\s+/g, " ");
    if (!seen.has(key)) {
      seen.add(key);
      uniqueAreas.push(a);
    }
  }

  // For each area, extract the text section until the next area
  for (let i = 0; i < uniqueAreas.length; i++) {
    const start = uniqueAreas[i].index;
    const end = i + 1 < uniqueAreas.length ? uniqueAreas[i + 1].index : Math.min(start + 3000, text.length);
    const section = text.substring(start, end);

    const area = parseAreaSection(section, uniqueAreas[i].name, uniqueAreas[i].alt);
    if (area) areas.push(area);
  }

  // Extract any closure notices from the top of the page
  let notices = "";
  const noticeMatch = text.match(/(The\s+[\s\S]{5,500}?ski\s+area)/i);
  if (noticeMatch) notices = noticeMatch[1].trim();

  // Also look for specific closure patterns
  const closureNotices = [];
  const closureRegex = /The\s+([\w\s\-()]+?)\s+(?:ski\s+area|site|will\s+be)\s+(?:is\s+)?closed[^.]*\./gi;
  let cm;
  while ((cm = closureRegex.exec(text)) !== null) {
    closureNotices.push(cm[0].trim());
  }

  return {
    pageDate,
    dailyReport: dailyReport || "No daily report found",
    closureNotices,
    areas,
    areaCount: areas.length,
  };
}

function parseAreaSection(s, name, alt) {
  const snowMatch = s.match(/Snow\s+height\s*:?\s*\**\s*(\d[\d\s]*)\s*cm/i);
  const qualityMatch = s.match(/Snow\s+quality\s*:?\s*\**\s*([A-Za-zà-ÿ\s]+?)(?:\*|\s{2}|Snow|Fresh|Last|Visibility|Wind)/i);
  const freshMatch = s.match(/Fresh\s+snow\s*:?\s*\**\s*(\d[\d\s]*)\s*cm/i);
  const lastSnowMatch = s.match(/Last\s+snow\s*fall?\s*:?\s*\**\s*([\d/]+)/i);
  const visMatch = s.match(/Visibility\s*:?\s*\**\s*([^\n.]{3,40}?)(?:\s{2}|Wind|$)/i);
  const windMatch = s.match(/Wind\s*:?\s*\**\s*([\d.]+\s*[Kk]m\/h\s*[A-Z]{1,3})/i);
  const avalMatch = s.match(/(\d)\s*\/\s*5\s+Avalanche/i);

  // Temps — look for °C followed by Morning/Afternoon context
  const tempMorn = s.match(/(-?\d+)\s*°C\s+Morning/i);
  const tempAft = s.match(/(-?\d+)\s*°C\s+Afternoon/i);

  // Lifts
  const liftMatch = s.match(/Lift\s*\(\s*(\d+)\s*\/\s*(\d+)\s*\)/i);
  const trainMatch = s.match(/Trains?\s*(?:&\s*Visits?)?\s*\(\s*(\d+)\s*\/\s*(\d+)\s*\)/i);
  const slopeMatch = s.match(/Slopes?\s*\(\s*(\d+)\s*\/\s*(\d+)\s*\)/i);

  // Closure check
  const closedPatterns = /Closed\s+(?:all\s+day|for\s+the\s+day|today|:\s*bad|:\s*avalanch|:\s*wind)/i;
  const isClosed = closedPatterns.test(s);
  let closureReason = "";
  const crMatch = s.match(/Closed\s*[:\s]+([a-zA-Z\s]{3,40})/i);
  if (crMatch) closureReason = crMatch[1].trim();

  // Classify to resort
  const resort = classifyToResort(name);
  if (!resort) return null; // skip unrecognizable areas

  // Only return if we got meaningful data
  const snow = snowMatch ? snowMatch[1].replace(/\s/g, "") : "";
  if (!snow && !liftMatch && !trainMatch) return null; // no useful data

  return {
    name,
    alt,
    resort,
    snow: snow ? snow + "cm" : "—",
    quality: qualityMatch ? qualityMatch[1].trim() : "—",
    fresh: freshMatch ? freshMatch[1].replace(/\s/g, "") + "cm" : "0cm",
    tempMorning: tempMorn ? tempMorn[1] + "°C" : null,
    tempAfternoon: tempAft ? tempAft[1] + "°C" : null,
    avalanche: avalMatch ? avalMatch[1] + "/5" : null,
    liftsOpen: liftMatch ? parseInt(liftMatch[1]) : trainMatch ? parseInt(trainMatch[1]) : null,
    liftsTotal: liftMatch ? parseInt(liftMatch[2]) : trainMatch ? parseInt(trainMatch[2]) : null,
    slopesOpen: slopeMatch ? parseInt(slopeMatch[1]) : null,
    slopesTotal: slopeMatch ? parseInt(slopeMatch[2]) : null,
    wind: windMatch ? windMatch[1].trim() : null,
    visibility: visMatch ? visMatch[1].trim() : null,
    lastSnowfall: lastSnowMatch ? lastSnowMatch[1] : null,
    isClosed,
    closureReason,
  };
}

function classifyToResort(name) {
  const l = (name || "").toLowerCase();
  const map = {
    "brévent": "chamonix", "brevent": "chamonix", "flégère": "chamonix", "flegere": "chamonix",
    "grands montets": "chamonix", "aiguille du midi": "chamonix", "montenvers": "chamonix",
    "balme": "vallorcine", "vallorcine": "vallorcine", "le tour": "vallorcine",
    "houches": "saint-gervais", "saint-gervais": "saint-gervais", "saint gervais": "saint-gervais",
    "tramway": "saint-gervais",
  };
  for (const [k, v] of Object.entries(map)) {
    if (l.includes(k)) return v;
  }
  // Skip beginner/misc areas
  if (l.includes("vormaine") || l.includes("planards") || l.includes("chosalets") || l.includes("savoy")) return null;
  return null;
}
