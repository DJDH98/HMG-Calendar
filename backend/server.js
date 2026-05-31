import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import path from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config();

const PORT = Number(process.env.PORT || 3000);
const RADARR_URL = process.env.RADARR_URL || "http://radarr:7878";
const SONARR_URL = process.env.SONARR_URL || "http://sonarr:8989";
const RADARR_API_KEY = process.env.RADARR_API_KEY || "";
const SONARR_API_KEY = process.env.SONARR_API_KEY || "";
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 12000);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = process.env.PUBLIC_DIR || path.join(__dirname, "public");

const app = express();

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: false
}));
app.use(cors({ origin: true }));
app.use(express.json());
app.use(morgan("combined"));
app.use(express.static(PUBLIC_DIR, {
  extensions: ["html"],
  maxAge: process.env.NODE_ENV === "production" ? "1h" : 0
}));

function normalizeBaseUrl(url) {
  return String(url || "").replace(/\/+$/, "");
}

function appendDateRange(url, start, end) {
  if (start) {
    url.searchParams.set("start", start);
  }
  if (end) {
    url.searchParams.set("end", end);
  }
}

function appendCalendarIncludes(url, serviceName) {
  if (serviceName === "sonarr") {
    url.searchParams.set("includeSeries", "true");
    url.searchParams.set("includeEpisodeFile", "true");
    url.searchParams.set("includeEpisodeImages", "true");
  }

  if (serviceName === "radarr") {
    url.searchParams.set("includeMovie", "true");
    url.searchParams.set("includeMovieFile", "true");
  }
}

async function fetchCalendar(serviceName, baseUrl, apiKey, start, end) {
  if (!apiKey) {
    return {
      service: serviceName,
      ok: false,
      data: [],
      error: `${serviceName} API key is not configured`
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const url = new URL(`${normalizeBaseUrl(baseUrl)}/api/v3/calendar`);

  appendDateRange(url, start, end);
  appendCalendarIncludes(url, serviceName);

  try {
    const response = await fetch(url, {
      headers: {
        "X-Api-Key": apiKey,
        "Accept": "application/json"
      },
      signal: controller.signal
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`HTTP ${response.status}${body ? `: ${body.slice(0, 180)}` : ""}`);
    }

    const payload = await response.json();
    return {
      service: serviceName,
      ok: true,
      data: Array.isArray(payload) ? payload : []
    };
  } catch (error) {
    return {
      service: serviceName,
      ok: false,
      data: [],
      error: error.name === "AbortError" ? "Request timed out" : error.message
    };
  } finally {
    clearTimeout(timeout);
  }
}

function pickImagePath(images = [], preferredCoverType = "poster") {
  const candidates = Array.isArray(images) ? images : [];
  const image = candidates.find((item) => item.coverType === preferredCoverType) || candidates[0];

  return image?.url || image?.remoteUrl || null;
}

function posterProxyPath(source, imagePath) {
  if (!imagePath) {
    return null;
  }

  return `/api/poster?source=${encodeURIComponent(source)}&path=${encodeURIComponent(imagePath)}`;
}

function serviceConfig(source) {
  if (source === "radarr") {
    return {
      baseUrl: RADARR_URL,
      apiKey: RADARR_API_KEY
    };
  }

  if (source === "sonarr") {
    return {
      baseUrl: SONARR_URL,
      apiKey: SONARR_API_KEY
    };
  }

  return null;
}

function resolveServiceAssetUrl(source, imagePath) {
  const config = serviceConfig(source);

  if (!config || !imagePath) {
    return null;
  }

  const baseUrl = normalizeBaseUrl(config.baseUrl);
  const resolved = new URL(imagePath, `${baseUrl}/`);
  const allowed = new URL(baseUrl);

  if (resolved.origin !== allowed.origin) {
    return null;
  }

  return resolved;
}

function formatQuality(item) {
  return item?.quality?.quality?.name || item?.movie?.qualityProfile?.name || item?.series?.qualityProfile?.name || "Unknown";
}

function hasFile(item, source) {
  if (source === "radarr") {
    return Boolean(item?.movie?.movieFile || item?.movieFile);
  }

  return Boolean(item?.episodeFile || item?.hasFile);
}

function getRadarrDate(item) {
  return item?.inCinemas || item?.physicalRelease || item?.digitalRelease || item?.releaseDate || item?.airDateUtc;
}

function mapRadarrEvent(item) {
  const movie = item?.movie || item;
  const start = getRadarrDate(item);
  const downloaded = hasFile(item, "radarr");

  return {
    id: `radarr-${movie?.id || item?.id || start}`,
    title: movie?.title || item?.title || "Untitled Movie",
    start,
    allDay: true,
    color: "#f5a623",
    textColor: "#111111",
    extendedProps: {
      source: "radarr",
      type: "Movie",
      overview: movie?.overview || item?.overview || "",
      poster: posterProxyPath("radarr", pickImagePath(movie?.images || item?.images)),
      status: downloaded ? "Downloaded" : "In Cinematic Release",
      qualityProfile: movie?.qualityProfile?.name || formatQuality(item),
      year: movie?.year || null,
      runtime: movie?.runtime || null,
      monitored: movie?.monitored ?? null,
      rawStatus: movie?.status || item?.status || null
    }
  };
}

function mapSonarrEvent(item) {
  const series = item?.series || {};
  const episodeTitle = item?.title || "Episode";
  const season = item?.seasonNumber;
  const episode = item?.episodeNumber;
  const episodeCode = Number.isInteger(season) && Number.isInteger(episode)
    ? `S${String(season).padStart(2, "0")}E${String(episode).padStart(2, "0")}`
    : null;
  const seriesTitle = series.title || item?.seriesTitle || item?.showTitle || "Unknown Series";
  const title = [seriesTitle, episodeCode, episodeTitle].filter(Boolean).join(" - ");
  const downloaded = hasFile(item, "sonarr");

  return {
    id: `sonarr-${item?.id || item?.episodeId || item?.airDateUtc}`,
    title,
    start: item?.airDateUtc || item?.airDate,
    allDay: !item?.airDateUtc,
    color: "#2f80ed",
    textColor: "#ffffff",
    extendedProps: {
      source: "sonarr",
      type: "TV Episode",
      overview: item?.overview || series?.overview || "",
      poster: posterProxyPath("sonarr", pickImagePath(series?.images)),
      status: downloaded ? "Downloaded" : "Upcoming Airing",
      qualityProfile: series?.qualityProfile?.name || formatQuality(item),
      season,
      episode,
      network: series?.network || null,
      monitored: item?.monitored ?? series?.monitored ?? null,
      rawStatus: series?.status || null
    }
  };
}

function isValidEvent(event) {
  return Boolean(event.start);
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "hmg-calendar-backend"
  });
});

app.get("/api/calendar", async (req, res) => {
  const { start, end } = req.query;

  const [radarr, sonarr] = await Promise.all([
    fetchCalendar("radarr", RADARR_URL, RADARR_API_KEY, start, end),
    fetchCalendar("sonarr", SONARR_URL, SONARR_API_KEY, start, end)
  ]);

  const events = [
    ...radarr.data.map(mapRadarrEvent),
    ...sonarr.data.map(mapSonarrEvent)
  ].filter(isValidEvent);

  res.json({
    events,
    meta: {
      generatedAt: new Date().toISOString(),
      services: [
        { name: "radarr", ok: radarr.ok, error: radarr.error || null },
        { name: "sonarr", ok: sonarr.ok, error: sonarr.error || null }
      ]
    }
  });
});

app.get("/api/poster", async (req, res) => {
  const source = String(req.query.source || "");
  const imagePath = String(req.query.path || "");
  const config = serviceConfig(source);
  const url = resolveServiceAssetUrl(source, imagePath);

  if (!config || !url) {
    res.status(400).json({ error: "Invalid poster source" });
    return;
  }

  try {
    const response = await fetch(url, {
      headers: config.apiKey ? { "X-Api-Key": config.apiKey } : undefined
    });

    if (!response.ok) {
      throw new Error(`Poster fetch failed with HTTP ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";
    const buffer = Buffer.from(await response.arrayBuffer());

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(buffer);
  } catch (error) {
    console.error(error);
    res.status(502).json({ error: "Unable to load poster" });
  }
});

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) {
    next();
    return;
  }

  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`HMG Calendar backend listening on port ${PORT}`);
});
