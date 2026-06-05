# Monsoon Brief

Monsoon Brief is a polished Weather-AI showcase app built for the Weather-AI integration assessment. It turns the core forecast API into a responsive weather command center with a forecast-first dashboard, an AI summary layer, manual coordinate search, browser geolocation, and a server-side integration path that keeps the API key off the client.

## What it demonstrates

- Integration with the Weather-AI REST API through a Next.js server route
- A resilient forecast experience that can fall back to seeded demo data when an API key is not present
- Current conditions, hourly trend, seven-day forecast, and weather highlights
- AI summary toggle, unit switching, preset cities, custom coordinates, and geolocation
- Production-ready Next.js App Router structure with TypeScript

## Stack

- Next.js 16
- React 19
- TypeScript
- App Router
- CSS Modules

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Create a local environment file:

```bash
cp .env.example .env.local
```

3. Add your Weather-AI API key to `.env.local`:

```bash
WEATHER_AI_API_KEY=wai_your_api_key_here
WEATHER_AI_BASE_URL=https://api.weather-ai.co
```

4. Start the development server:

```bash
npm run dev
```

5. Open `http://localhost:3000`

## Available scripts

```bash
npm run dev
npm run lint
npm run build
npm run start
```

## Project structure

```text
src/
  app/
    api/weather/route.ts      # Server-side Weather-AI proxy route
    globals.css               # Global visual system
    layout.tsx                # App shell metadata
    page.tsx                  # Home page entry
  components/
    weather-dashboard.tsx     # Interactive dashboard UI
    weather-dashboard.module.css
  lib/
    mock-weather.ts           # Demo-mode fallback data
    weather-ai.ts             # Weather-AI fetch + normalization logic
    weather-insights.ts       # Derived insight cards
    weather-types.ts          # Shared types
```

## API notes

This app is designed around the Weather-AI weather endpoints documented at `https://weather-ai.co/docs`.

- Base URL: `https://api.weather-ai.co`
- Auth: `Authorization: Bearer wai_<your_api_key>`
- Main endpoint used: `GET /v1/weather`

The dashboard fetches data through a local server route at `src/app/api/weather/route.ts`, which means the Weather-AI API key is not exposed in the browser.

## Demo mode

If `WEATHER_AI_API_KEY` is missing, the app still runs using seeded fallback data. This keeps the interface interactive for local development and makes the UI easy to review before a live key is added.

## Deployment

This project is ready to deploy on Vercel.

Recommended deployment steps:

1. Push the repository to GitHub
2. Import the repository into Vercel
3. Set `WEATHER_AI_API_KEY` and `WEATHER_AI_BASE_URL` in the Vercel project environment variables
4. Deploy

## Verification

The project has been verified with:

```bash
npm run lint
npm run build
```
