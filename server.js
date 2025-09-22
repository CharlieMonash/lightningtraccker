// server.js — Tas Lightning MVP
const express = require("express");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.static("public"));

// --- Utils ---
function toISO(dt) { return dt.toISOString().slice(0,19) + "Z"; }
function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = d => d * Math.PI / 180;
  const R = 6371;
  const dLat = toRad(lat2-lat1);
  const dLon = toRad(lon2-lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}

// Load stations (static list)
const STATIONS = require("./stations.json");

// --- API: stations (static) ---
app.get("/api/stations", (req, res) => {
  res.json({ stations: STATIONS });
});

// --- API: scan lightning near each station ---
// GET /api/scan?minutes=15&radiusKm=50&includeIC=false
app.get("/api/scan", async (req, res) => {
  try {
    const minutes = Number(req.query.minutes ?? 15);
    const radiusKm = Number(req.query.radiusKm ?? 50);
    const includeIC = String(req.query.includeIC ?? "false") === "true";

    const end = new Date();
    const start = new Date(end.getTime() - minutes*60*1000);

    const client_id = process.env.XWEATHER_CLIENT_ID;
    const client_secret = process.env.XWEATHER_CLIENT_SECRET;
    if (!client_id || !client_secret) {
      return res.status(500).json({ error: "Missing XWEATHER_CLIENT_ID/SECRET env vars" });
    }

    // Fetch lightning near each station (in parallel, but gently)
    const results = await Promise.all(STATIONS.map(async (s) => {
      const params = new URLSearchParams({
        radius: String(radiusKm),
        limit: "1000",
        format: "json",
        from: toISO(start),
        to: toISO(end),
        client_id,
        client_secret
      });
      if (!includeIC) params.set("filter", "cg");

      // Use path style lat,lon; switch order if provider expects lon,lat
      const url = `https://data.api.xweather.com/lightning/${s.lat},${s.lon}?${params.toString()}`;
      const r = await fetch(url);
      let body;
      try { body = await r.json(); } catch(e) { body = { success:false, error:{ description: "Bad JSON from Xweather" } }; }

      if (!body?.success) {
        return { station: s.name, lat: s.lat, lon: s.lon, error: body?.error || { description: "request failed" }, strikes: [], nearestKm: null };
      }
      const strikes = (body.response || []).map(p => ({
        lat: p.lat, lon: p.lon, dateTime: p.dateTime, type: p.type, amp: p.amp, polarity: p.polarity
      }));

      // Compute nearest distance (if any)
      let nearestKm = null;
      if (strikes.length) {
        nearestKm = strikes.reduce((min, p) => Math.min(min, haversineKm(s.lat, s.lon, p.lat, p.lon)), Infinity);
        if (!isFinite(nearestKm)) nearestKm = null;
      }
      return { station: s.name, lat: s.lat, lon: s.lon, nearestKm, strikes };
    }));

    // Build a flattened set of unique strike points across all stations (for map display)
    const mapPoints = [];
    const keyset = new Set();
    for (const r of results) {
      for (const p of r.strikes) {
        const key = `${p.lat.toFixed(4)},${p.lon.toFixed(4)},${p.dateTime}`;
        if (!keyset.has(key)) {
          keyset.add(key);
          mapPoints.push(p);
        }
      }
    }

    res.json({ updatedAt: toISO(end), minutes, radiusKm, results, points: mapPoints });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// --- API: transmission lines (GA layer 2) with bbox ---
// GET /api/lines?xmin=&ymin=&xmax=&ymax=  (WGS84)
app.get("/api/lines", async (req, res) => {
  try {
    const { xmin, ymin, xmax, ymax } = req.query;
    if ([xmin, ymin, xmax, ymax].some(v => v === undefined)) {
      return res.status(400).json({ error: "Missing bbox params: xmin,ymin,xmax,ymax" });
    }
    const base = "https://services.ga.gov.au/gis/rest/services/National_Electricity_Infrastructure/MapServer/2/query";
    // First try GeoJSON (many ArcGIS servers support this). If it fails, fall back to ESRI JSON and convert.
    const qs = new URLSearchParams({
      where: "1=1",
      geometry: `${xmin},${ymin},${xmax},${ymax}`,
      geometryType: "esriGeometryEnvelope",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "*",
      returnGeometry: "true",
      f: "geojson"
    });
    const url = `${base}?${qs.toString()}`;
    let r = await fetch(url);
    if (r.ok) {
      const gj = await r.json();
      if (gj && (gj.type === "FeatureCollection" || gj.features)) {
        return res.json(gj);
      }
    }
    // Fallback to ESRI JSON and do a quick conversion for polylines
    const qs2 = new URLSearchParams({
      where: "1=1",
      geometry: `${xmin},${ymin},${xmax},${ymax}`,
      geometryType: "esriGeometryEnvelope",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "*",
      returnGeometry: "true",
      f: "json"
    });
    r = await fetch(`${base}?${qs2.toString()}`);
    const esri = await r.json();
    const features = (esri.features || []).map(feat => {
      const paths = (feat.geometry?.paths || []);
      // Convert first path only for simplicity; many lines will be single-part.
      const coords = paths[0]?.map(([x,y]) => [x,y]) || [];
      return {
        type: "Feature",
        geometry: { type: "LineString", coordinates: coords },
        properties: feat.attributes || {}
      };
    });
    return res.json({ type: "FeatureCollection", features });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.listen(PORT, () => {
  console.log(`Tas Lightning MVP running on http://localhost:${PORT}`);
});
