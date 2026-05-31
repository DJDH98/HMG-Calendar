# HMG Calendar

HMG Calendar is a self-hosted media calendar dashboard for Unraid and Docker. It aggregates upcoming movie release dates from Radarr and TV air dates from Sonarr, then presents them in a single dark-mode FullCalendar interface.

## Features

- Backend-only access to Radarr and Sonarr using Docker-internal URLs.
- `GET /api/calendar` endpoint that merges Radarr and Sonarr `/api/v3/calendar` data.
- Resilient partial loading if either Radarr or Sonarr is offline.
- Vanilla HTML, CSS, and JavaScript frontend using FullCalendar v6 from CDN.
- Month grid and agenda list views.
- Interactive detail modal with poster canvas, overview, status, quality profile, and source.
- Single-container image for Unraid templates and Docker Compose.
- Docker Compose setup for the existing external `ibrapproxy` network.

## Project Structure

```text
backend/
  Dockerfile
  package.json
  server.js
  .env.example
frontend/
  Dockerfile
  index.html
  style.css
  script.js
  nginx.conf
.github/workflows/
  publish-container.yml
Dockerfile
docker-compose.yml
README.md
```

## Configuration

Create a `.env` file beside `docker-compose.yml`:

```env
RADARR_URL=http://radarr:7878
RADARR_API_KEY=your_radarr_api_key_here
SONARR_URL=http://sonarr:8989
SONARR_API_KEY=your_sonarr_api_key_here
```

The default internal service URLs match your `ibrapproxy` network:

- Radarr: `http://radarr:7878`
- Sonarr: `http://sonarr:8989`

You can also use the internal IPs if container DNS is not available:

```env
RADARR_URL=http://172.18.0.10:7878
SONARR_URL=http://172.18.0.12:8989
```

## Deployment

### Unraid Docker Template

Use this image in the Unraid Docker form:

```text
ghcr.io/djdh98/hmg-calendar:latest
```

Suggested template values:

```text
Name: HMG Calendar
Repository: ghcr.io/djdh98/hmg-calendar:latest
Network Type: Custom: ibrapproxy
Console shell command: Shell
Privileged: Off
```

Add these variables:

```text
RADARR_URL=http://radarr:7878
RADARR_API_KEY=your_radarr_api_key_here
SONARR_URL=http://sonarr:8989
SONARR_API_KEY=your_sonarr_api_key_here
PORT=3000
```

Add this port mapping if Unraid asks for one:

```text
Container Port: 3000
Host Port: 3000
Connection Type: TCP
```

Point Nginx Proxy Manager at the HMG Calendar container on port `3000`.

### Docker Compose

Make sure the external Docker network already exists:

```bash
docker network inspect ibrapproxy
```

Build and start the app:

```bash
docker compose up -d --build
```

Point Nginx Proxy Manager at:

```text
hmg-calendar:3000
```

The browser should only talk to HMG Calendar. Radarr and Sonarr remain reachable only from the backend container on the internal Docker network.

## API

### `GET /api/calendar`

Optional query parameters:

- `start`: ISO date supplied by FullCalendar.
- `end`: ISO date supplied by FullCalendar.

Response:

```json
{
  "events": [
    {
      "id": "radarr-123",
      "title": "Example Movie",
      "start": "2026-06-01T00:00:00Z",
      "allDay": true,
      "color": "#f5a623",
      "textColor": "#111111",
      "extendedProps": {
        "source": "radarr",
        "type": "Movie",
        "overview": "Movie summary",
        "poster": "https://...",
        "status": "Downloaded",
        "qualityProfile": "HD-1080p"
      }
    }
  ],
  "meta": {
    "generatedAt": "2026-05-31T12:00:00.000Z",
    "services": [
      { "name": "radarr", "ok": true, "error": null },
      { "name": "sonarr", "ok": true, "error": null }
    ]
  }
}
```

## Local Development

Backend:

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

Frontend:

Serve `frontend/` with any static server for UI-only work. The production Docker image serves the frontend from the Express backend on port `3000`.

## Security Notes

- Do not expose Radarr or Sonarr API ports through Nginx Proxy Manager.
- Keep API keys in `.env`, not in Git.
- Configure NPM to route public traffic to `hmg-calendar:3000`.
- The browser calls HMG Calendar only. HMG Calendar talks to Radarr and Sonarr over the internal Docker network.
