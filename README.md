# Tas Lightning Alerts — MVP

A tiny web app that shows lightning near Tasmanian power stations and alerts when strikes are within a configurable radius. Also displays Australian HV transmission lines and Tas power stations on a map.

## Quick start

1. Unzip the project.
2. In a terminal:
   ```bash
   cd tas-lightning-mvp
   cp .env.example .env
   # edit .env and set your Xweather client_id and client_secret
   npm install
   npm start
   ```
3. Open your browser at: http://localhost:3001
   - The app serves the frontend and the API from the same port.

## Notes
- Default scan interval is 15 minutes; adjustable in the panel.
- Default alert radius is 50 km.
- You can include intracloud (IC) strikes via the checkbox.
- Transmission lines are fetched for the current map view from Geoscience Australia.
- Power stations are a static list in `stations.json` for reliability.

## Environment variables
See `.env.example`:
```
XWEATHER_CLIENT_ID=YOUR_CLIENT_ID
XWEATHER_CLIENT_SECRET=YOUR_CLIENT_SECRET
PORT=3001
```

## What it does
- Every scan: queries Xweather for each Tas power station within the chosen radius and time window; computes nearest distance; displays alerts if within radius.
- Map layers: transmission lines (grey), stations (blue), 50 km rings (black), lightning strikes (yellow).

