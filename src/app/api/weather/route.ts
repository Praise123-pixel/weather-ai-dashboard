import { getWeatherReport } from "@/lib/weather-ai";
import { buildDefaultQuery } from "@/lib/mock-weather";
import type { Units } from "@/lib/weather-types";

function clampDays(value: number): number {
  if (!Number.isFinite(value)) {
    return 7;
  }

  return Math.min(7, Math.max(1, Math.round(value)));
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const defaults = buildDefaultQuery();
  const lat = Number(url.searchParams.get("lat") ?? defaults.lat);
  const lon = Number(url.searchParams.get("lon") ?? defaults.lon);
  const days = clampDays(Number(url.searchParams.get("days") ?? defaults.days));
  const units = (url.searchParams.get("units") === "imperial" ? "imperial" : "metric") as Units;
  const ai = url.searchParams.get("ai") !== "false";
  const label = url.searchParams.get("label") ?? defaults.label;
  const timezone = url.searchParams.get("timezone") ?? defaults.timezone;

  const report = await getWeatherReport({
    lat: Number.isFinite(lat) ? lat : defaults.lat,
    lon: Number.isFinite(lon) ? lon : defaults.lon,
    days,
    units,
    ai,
    label,
    timezone,
  });

  return Response.json(report);
}
