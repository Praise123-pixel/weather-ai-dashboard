import { buildWeatherInsights } from "@/lib/weather-insights";
import { getMockWeatherReport } from "@/lib/mock-weather";
import { toWeatherSearchParams } from "@/lib/weather-query";
import type {
  DailyPoint,
  HourlyPoint,
  Units,
  WeatherQuery,
  WeatherReport,
} from "@/lib/weather-types";

const API_BASE = process.env.WEATHER_AI_BASE_URL ?? "https://api.weather-ai.co";
const LIVE_CACHE_TTL_MS = 3 * 60 * 1000;
const STALE_CACHE_TTL_MS = 30 * 60 * 1000;
const FETCH_RETRY_DELAYS_MS = [300, 900];
const liveReportCache = new Map<string, { report: WeatherReport; cachedAt: number }>();

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function firstDefined<T>(...values: Array<T | undefined>): T | undefined {
  return values.find((value) => value !== undefined);
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
}

function firstNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return undefined;
}

function pickValue(record: Record<string, unknown> | undefined, keys: string[]): unknown {
  if (!record) {
    return undefined;
  }

  for (const key of keys) {
    if (key in record) {
      return record[key];
    }
  }

  return undefined;
}

function convertTemperature(value: number, fromUnits: Units, toUnits: Units): number {
  if (fromUnits === toUnits) {
    return value;
  }

  if (fromUnits === "metric" && toUnits === "imperial") {
    return (value * 9) / 5 + 32;
  }

  return ((value - 32) * 5) / 9;
}

function convertSpeed(value: number, fromUnits: Units, toUnits: Units): number {
  if (fromUnits === toUnits) {
    return value;
  }

  if (fromUnits === "metric" && toUnits === "imperial") {
    return value * 0.621371;
  }

  return value / 0.621371;
}

function getTemperature(record: Record<string, unknown> | undefined, units: Units): number | undefined {
  const exact = firstNumber(
    units === "metric"
      ? pickValue(record, ["temperature", "temp_c", "temperature_c", "current_temperature"])
      : pickValue(record, ["temperature", "temp_f", "temperature_f", "current_temperature"]),
  );
  if (exact !== undefined) {
    return exact;
  }

  const metricValue = firstNumber(pickValue(record, ["temp_c", "temperature_c"]));
  if (metricValue !== undefined) {
    return convertTemperature(metricValue, "metric", units);
  }

  const imperialValue = firstNumber(pickValue(record, ["temp_f", "temperature_f"]));
  if (imperialValue !== undefined) {
    return convertTemperature(imperialValue, "imperial", units);
  }

  return firstNumber(pickValue(record, ["temp", "temperature"]));
}

function getSpeed(record: Record<string, unknown> | undefined, units: Units): number | undefined {
  const exact = firstNumber(
    units === "metric"
      ? pickValue(record, ["wind_kph", "windSpeed", "wind_speed"])
      : pickValue(record, ["wind_mph", "windSpeed", "wind_speed"]),
  );
  if (exact !== undefined) {
    return exact;
  }

  const metricValue = firstNumber(pickValue(record, ["wind_kph"]));
  if (metricValue !== undefined) {
    return convertSpeed(metricValue, "metric", units);
  }

  const imperialValue = firstNumber(pickValue(record, ["wind_mph"]));
  if (imperialValue !== undefined) {
    return convertSpeed(imperialValue, "imperial", units);
  }

  return firstNumber(pickValue(record, ["windSpeed", "wind_speed"]));
}

function getVisibility(record: Record<string, unknown> | undefined, units: Units): number | undefined {
  const exact = firstNumber(
    units === "metric"
      ? pickValue(record, ["vis_km", "visibility", "visibility_km"])
      : pickValue(record, ["vis_miles", "visibility", "visibility_mi"]),
  );
  if (exact !== undefined) {
    return exact;
  }

  const metricValue = firstNumber(pickValue(record, ["vis_km", "visibility_km"]));
  if (metricValue !== undefined) {
    return units === "metric" ? metricValue : metricValue * 0.621371;
  }

  const imperialValue = firstNumber(pickValue(record, ["vis_miles", "visibility_mi"]));
  if (imperialValue !== undefined) {
    return units === "imperial" ? imperialValue : imperialValue / 0.621371;
  }

  return firstNumber(pickValue(record, ["visibility"]));
}

function getDailyTemperature(
  record: Record<string, unknown> | undefined,
  kind: "min" | "max",
  units: Units,
): number | undefined {
  const exact = firstNumber(
    units === "metric"
      ? pickValue(record, kind === "min" ? ["mintemp_c", "min_temp", "min"] : ["maxtemp_c", "max_temp", "max"])
      : pickValue(record, kind === "min" ? ["mintemp_f", "min_temp", "min"] : ["maxtemp_f", "max_temp", "max"]),
  );
  if (exact !== undefined) {
    return exact;
  }

  const metricValue = firstNumber(
    pickValue(record, kind === "min" ? ["mintemp_c"] : ["maxtemp_c"]),
  );
  if (metricValue !== undefined) {
    return convertTemperature(metricValue, "metric", units);
  }

  const imperialValue = firstNumber(
    pickValue(record, kind === "min" ? ["mintemp_f"] : ["maxtemp_f"]),
  );
  if (imperialValue !== undefined) {
    return convertTemperature(imperialValue, "imperial", units);
  }

  return undefined;
}

function formatHour(value: string, timezone: string): string {
  if (/^\d{2}:\d{2}$/.test(value)) {
    return value;
  }

  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: timezone,
  });
}

function buildCacheKey(query: WeatherQuery): string {
  return toWeatherSearchParams(query).toString();
}

function readCachedLiveReport(
  key: string,
  maxAgeMs: number,
): { report: WeatherReport; cachedAt: number } | undefined {
  const entry = liveReportCache.get(key);
  if (!entry) {
    return undefined;
  }

  if (Date.now() - entry.cachedAt > maxAgeMs) {
    return undefined;
  }

  return entry;
}

function writeCachedLiveReport(key: string, report: WeatherReport): void {
  liveReportCache.set(key, {
    report,
    cachedAt: Date.now(),
  });
}

async function pause(delayMs: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

async function fetchLiveWeatherPayload(query: WeatherQuery, apiKey: string): Promise<unknown> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= FETCH_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const response = await fetch(`${API_BASE}/v1/weather?${toWeatherSearchParams(query).toString()}`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Weather-AI returned ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Unknown Weather-AI fetch error");
      if (attempt < FETCH_RETRY_DELAYS_MS.length) {
        await pause(FETCH_RETRY_DELAYS_MS[attempt] ?? 300);
      }
    }
  }

  throw lastError ?? new Error("Unknown Weather-AI fetch error");
}

function extractDailySource(root: Record<string, unknown>): unknown[] {
  const forecastRecord = asRecord(root.forecast);
  return asArray(
    firstDefined(
      asArray(forecastRecord?.forecastday),
      asArray(root.daily),
      asArray(root.days),
      asArray(root.forecast_days),
    ),
  );
}

function extractHourlySource(root: Record<string, unknown>, dailySource: unknown[]): unknown[] {
  const forecastRecord = asRecord(root.forecast);
  const directHourly = asArray(
    firstDefined(
      asArray(root.hourly),
      asArray(forecastRecord?.hourly),
      asArray(root.hours),
    ),
  );

  if (directHourly.length > 0) {
    return directHourly;
  }

  const nestedHours = dailySource.flatMap((day) => {
    const dayRecord = asRecord(day);
    return asArray(dayRecord?.hour);
  });

  return nestedHours;
}

function normalizeDailyPoint(
  value: unknown,
  fallback: DailyPoint,
  units: Units,
): DailyPoint {
  const record = asRecord(value);
  const dayRecord = asRecord(record?.day);
  const astroRecord = asRecord(record?.astro);

  return {
    date: firstString(pickValue(record, ["date"]), fallback.date) ?? fallback.date,
    min: getDailyTemperature(dayRecord, "min", units) ?? fallback.min,
    max: getDailyTemperature(dayRecord, "max", units) ?? fallback.max,
    precipitationChance:
      firstNumber(
        pickValue(dayRecord, [
          "daily_chance_of_rain",
          "chance_of_rain",
          "precipitationChance",
          "precip_probability",
        ]),
      ) ?? fallback.precipitationChance,
    condition:
      firstString(
        pickValue(asRecord(dayRecord?.condition), ["text"]),
        pickValue(dayRecord, ["condition", "summary"]),
        fallback.condition,
      ) ?? fallback.condition,
    sunrise: firstString(pickValue(astroRecord, ["sunrise"]), fallback.sunrise) ?? fallback.sunrise,
    sunset: firstString(pickValue(astroRecord, ["sunset"]), fallback.sunset) ?? fallback.sunset,
  };
}

function normalizeHourlyPoint(
  value: unknown,
  fallback: HourlyPoint,
  units: Units,
): HourlyPoint {
  const record = asRecord(value);

  return {
    time: firstString(pickValue(record, ["time"]), pickValue(record, ["timestamp"]), fallback.time) ?? fallback.time,
    temperature: getTemperature(record, units) ?? fallback.temperature,
    precipitationChance:
      firstNumber(
        pickValue(record, [
          "chance_of_rain",
          "precipitationChance",
          "precip_probability",
          "rain_chance",
        ]),
      ) ?? fallback.precipitationChance,
    condition:
      firstString(
        pickValue(asRecord(record?.condition), ["text"]),
        pickValue(record, ["condition", "summary", "weather"]),
        fallback.condition,
      ) ?? fallback.condition,
  };
}

function normalizeWeatherPayload(
  payload: unknown,
  query: WeatherQuery,
  fallback: WeatherReport,
): WeatherReport {
  const root = asRecord(payload);
  if (!root) {
    return fallback;
  }

  const locationRecord = asRecord(root.location) ?? asRecord(root.geo);
  const currentRecord =
    asRecord(root.current) ??
    asRecord(root.current_weather) ??
    asRecord(root.weather) ??
    root;
  const conditionRecord = asRecord(currentRecord?.condition);
  const dailySource = extractDailySource(root);
  const hourlySource = extractHourlySource(root, dailySource);
  const firstDailyRecord = asRecord(dailySource[0]);
  const firstDailyDayRecord = asRecord(firstDailyRecord?.day);
  const firstDailyConditionRecord = asRecord(firstDailyDayRecord?.condition);

  const daily = fallback.daily.map((entry, index) =>
    normalizeDailyPoint(dailySource[index], entry, query.units),
  );
  const hourly = fallback.hourly.map((entry, index) =>
    normalizeHourlyPoint(hourlySource[index], entry, query.units),
  );
  const locationTimezone =
    firstString(
      pickValue(locationRecord, ["tz_id", "timezone"]),
      query.timezone,
      fallback.location.timezone,
    ) ?? fallback.location.timezone;
  const liveCondition =
    firstString(
      pickValue(conditionRecord, ["text"]),
      pickValue(currentRecord, ["condition", "weather", "status", "description"]),
      pickValue(firstDailyConditionRecord, ["text"]),
      pickValue(firstDailyDayRecord, ["condition", "summary"]),
      pickValue(root, ["condition", "weather"]),
    ) ?? "Current conditions";
  const liveDescription =
    firstString(
      pickValue(currentRecord, ["description", "summary"]),
      pickValue(root, ["summary", "ai_summary"]),
      pickValue(firstDailyDayRecord, ["summary"]),
    ) ?? "Live forecast feed active.";

  const report: WeatherReport = {
    source: "live",
    sourceDetail: "Live Weather-AI response delivered through a server-side Next.js route.",
    generatedAt: new Date().toISOString(),
    units: query.units,
    summary:
      firstString(
        pickValue(root, ["summary", "ai_summary"]),
        pickValue(asRecord(root.insights), ["summary"]),
        pickValue(currentRecord, ["summary", "description"]),
      ) ?? fallback.summary,
    location: {
      label:
        firstString(
          pickValue(locationRecord, ["name", "city", "label"]),
          query.label,
          fallback.location.label,
        ) ?? fallback.location.label,
      region:
        firstString(
          pickValue(locationRecord, ["region", "state", "admin1"]),
          fallback.location.region,
        ) ?? fallback.location.region,
      country:
        firstString(
          pickValue(locationRecord, ["country", "country_name"]),
          fallback.location.country,
        ) ?? fallback.location.country,
      lat:
        firstNumber(
          pickValue(locationRecord, ["lat", "latitude"]),
          query.lat,
        ) ?? query.lat,
      lon:
        firstNumber(
          pickValue(locationRecord, ["lon", "longitude"]),
          query.lon,
        ) ?? query.lon,
      timezone: locationTimezone,
    },
    current: {
      temperature: getTemperature(currentRecord, query.units) ?? fallback.current.temperature,
      apparentTemperature:
        firstNumber(
          query.units === "metric"
            ? pickValue(currentRecord, ["feelslike_c", "apparent_temperature", "heat_index_c"])
            : pickValue(currentRecord, ["feelslike_f", "apparent_temperature", "heat_index_f"]),
        ) ?? fallback.current.apparentTemperature,
      condition: liveCondition,
      description: liveDescription,
      humidity:
        firstNumber(pickValue(currentRecord, ["humidity", "relative_humidity"])) ??
        fallback.current.humidity,
      windSpeed: getSpeed(currentRecord, query.units) ?? fallback.current.windSpeed,
      precipitationChance:
        firstNumber(
          pickValue(currentRecord, [
            "precipitationChance",
            "chance_of_rain",
            "rain_chance",
          ]),
        ) ??
        daily[0]?.precipitationChance ??
        fallback.current.precipitationChance,
      pressure:
        firstNumber(
          query.units === "metric"
            ? pickValue(currentRecord, ["pressure_mb", "pressure"])
            : pickValue(currentRecord, ["pressure_in", "pressure"]),
        ) ?? fallback.current.pressure,
      uvIndex: firstNumber(pickValue(currentRecord, ["uv", "uvIndex"])) ?? fallback.current.uvIndex,
      visibility: getVisibility(currentRecord, query.units) ?? fallback.current.visibility,
      sunrise:
        firstString(
          pickValue(asRecord(asRecord(dailySource[0])?.astro), ["sunrise"]),
          daily[0]?.sunrise,
          fallback.current.sunrise,
        ) ?? fallback.current.sunrise,
      sunset:
        firstString(
          pickValue(asRecord(asRecord(dailySource[0])?.astro), ["sunset"]),
          daily[0]?.sunset,
          fallback.current.sunset,
        ) ?? fallback.current.sunset,
    },
    hourly: hourly.map((entry) => ({ ...entry, time: formatHour(entry.time, locationTimezone) })),
    daily,
    insights: [],
  };

  report.insights = buildWeatherInsights(report);
  return report;
}

export async function getWeatherReport(query: WeatherQuery): Promise<WeatherReport> {
  const fallback = getMockWeatherReport(query);
  const apiKey = process.env.WEATHER_AI_API_KEY;
  const cacheKey = buildCacheKey(query);
  const freshCached = readCachedLiveReport(cacheKey, LIVE_CACHE_TTL_MS);

  if (freshCached) {
    return freshCached.report;
  }

  if (!apiKey) {
    return fallback;
  }

  try {
    const payload = await fetchLiveWeatherPayload(query, apiKey);
    const liveReport = normalizeWeatherPayload(payload, query, fallback);
    writeCachedLiveReport(cacheKey, liveReport);
    return liveReport;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Weather-AI fetch error";
    const staleCached = readCachedLiveReport(cacheKey, STALE_CACHE_TTL_MS);
    if (staleCached) {
      return {
        ...staleCached.report,
        source: "live",
        sourceDetail: `${message}. Showing the latest cached live briefing instead of switching to fallback data.`,
      };
    }

    return {
      ...fallback,
      sourceDetail: `${message}. Showing fallback data to keep the dashboard available.`,
    };
  }
}
