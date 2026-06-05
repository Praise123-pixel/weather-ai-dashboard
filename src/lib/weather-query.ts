import { buildDefaultQuery, findNearestPreset } from "@/lib/mock-weather";
import type { WeatherQuery } from "@/lib/weather-types";

type SearchParamValue = string | string[] | undefined;
type SearchParamRecord = Record<string, SearchParamValue>;

function readValue(
  source: URLSearchParams | SearchParamRecord | undefined,
  key: string,
): string | undefined {
  if (!source) {
    return undefined;
  }

  if (source instanceof URLSearchParams) {
    return source.get(key) ?? undefined;
  }

  const value = source[key];
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampDays(value: number): number {
  if (!Number.isFinite(value)) {
    return 7;
  }

  return Math.min(7, Math.max(1, Math.round(value)));
}

export function buildWeatherQueryFromSearchParams(
  source?: URLSearchParams | SearchParamRecord,
): WeatherQuery {
  const defaults = buildDefaultQuery();
  const lat = parseNumber(readValue(source, "lat"), defaults.lat);
  const lon = parseNumber(readValue(source, "lon"), defaults.lon);
  const nearestPreset = findNearestPreset(lat, lon);
  const label = readValue(source, "label")?.trim() || nearestPreset.label;
  const timezone = readValue(source, "timezone")?.trim() || nearestPreset.timezone;

  return {
    lat,
    lon,
    days: clampDays(parseNumber(readValue(source, "days"), defaults.days)),
    units: readValue(source, "units") === "imperial" ? "imperial" : "metric",
    ai: readValue(source, "ai") !== "false",
    label,
    timezone,
  };
}

export function toWeatherSearchParams(query: WeatherQuery): URLSearchParams {
  const params = new URLSearchParams({
    lat: query.lat.toString(),
    lon: query.lon.toString(),
    days: query.days.toString(),
    units: query.units,
    ai: String(query.ai),
  });

  if (query.label) {
    params.set("label", query.label);
  }

  if (query.timezone) {
    params.set("timezone", query.timezone);
  }

  return params;
}
