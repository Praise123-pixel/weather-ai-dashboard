import { buildWeatherInsights } from "@/lib/weather-insights";
import type {
  DailyPoint,
  HourlyPoint,
  LocationPreset,
  Units,
  WeatherQuery,
  WeatherReport,
} from "@/lib/weather-types";

export const LOCATION_PRESETS: LocationPreset[] = [
  {
    id: "kampala",
    label: "Kampala",
    region: "Central Region",
    country: "Uganda",
    lat: 0.3476,
    lon: 32.5825,
    timezone: "Africa/Kampala",
  },
  {
    id: "nairobi",
    label: "Nairobi",
    region: "Nairobi County",
    country: "Kenya",
    lat: -1.2921,
    lon: 36.8219,
    timezone: "Africa/Nairobi",
  },
  {
    id: "kigali",
    label: "Kigali",
    region: "Kigali City",
    country: "Rwanda",
    lat: -1.9441,
    lon: 30.0619,
    timezone: "Africa/Kigali",
  },
  {
    id: "mombasa",
    label: "Mombasa",
    region: "Mombasa County",
    country: "Kenya",
    lat: -4.0435,
    lon: 39.6682,
    timezone: "Africa/Nairobi",
  },
  {
    id: "accra",
    label: "Accra",
    region: "Greater Accra",
    country: "Ghana",
    lat: 5.6037,
    lon: -0.187,
    timezone: "Africa/Accra",
  },
];

export const DEFAULT_PRESET = LOCATION_PRESETS[0];

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function toUnitTemperature(celsius: number, units: Units): number {
  if (units === "metric") {
    return round(celsius);
  }

  return round((celsius * 9) / 5 + 32);
}

function toUnitWind(kph: number, units: Units): number {
  if (units === "metric") {
    return round(kph);
  }

  return round(kph * 0.621371);
}

function formatHour(hour: number): string {
  const normalized = ((hour % 24) + 24) % 24;
  return `${normalized.toString().padStart(2, "0")}:00`;
}

function isoDate(offsetDays: number): string {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function chooseCondition(value: number): string {
  if (value >= 70) {
    return "Storm watch";
  }

  if (value >= 45) {
    return "Showers";
  }

  if (value >= 20) {
    return "Cloud breaks";
  }

  return "Clear intervals";
}

export function findNearestPreset(lat: number, lon: number): LocationPreset {
  return LOCATION_PRESETS.reduce((best, preset) => {
    const bestDistance = Math.hypot(best.lat - lat, best.lon - lon);
    const nextDistance = Math.hypot(preset.lat - lat, preset.lon - lon);
    return nextDistance < bestDistance ? preset : best;
  });
}

function createHourlySeries(query: WeatherQuery, baseline: number): HourlyPoint[] {
  const seed = Math.abs(Math.round((query.lat * 100 + query.lon * 10) * 7));

  return Array.from({ length: 12 }, (_, index) => {
    const wave = Math.sin((index + seed / 10) * 0.65) * 2.4;
    const temperature = toUnitTemperature(baseline + wave, query.units);
    const precipitationChance = Math.max(
      8,
      Math.min(88, Math.round(18 + ((index * 11 + seed) % 61))),
    );

    return {
      time: formatHour(6 + index),
      temperature,
      precipitationChance,
      condition: chooseCondition(precipitationChance),
    };
  });
}

function createDailySeries(query: WeatherQuery, baseline: number): DailyPoint[] {
  const seed = Math.abs(Math.round((query.lat * 40 + query.lon * 12) * 5));

  return Array.from({ length: query.days }, (_, index) => {
    const band = ((seed + index * 9) % 6) + 2;
    const min = toUnitTemperature(baseline - band, query.units);
    const max = toUnitTemperature(baseline + band + (index % 3), query.units);
    const precipitationChance = Math.max(
      12,
      Math.min(90, Math.round(22 + ((seed + index * 17) % 58))),
    );

    return {
      date: isoDate(index),
      min,
      max,
      precipitationChance,
      condition: chooseCondition(precipitationChance),
      sunrise: "06:18",
      sunset: "18:47",
    };
  });
}

export function getMockWeatherReport(query: WeatherQuery): WeatherReport {
  const preset = findNearestPreset(query.lat, query.lon);
  const seed = Math.abs(Math.round((query.lat * 73 + query.lon * 19) * 3));
  const baseCelsius = 22 + (seed % 7);
  const temperature = toUnitTemperature(baseCelsius, query.units);
  const apparentTemperature = toUnitTemperature(baseCelsius + 1.6, query.units);
  const hourly = createHourlySeries(query, baseCelsius);
  const daily = createDailySeries(query, baseCelsius);
  const humidity = 58 + (seed % 23);
  const windSpeed = toUnitWind(10 + (seed % 18), query.units);
  const precipitationChance = daily[0]?.precipitationChance ?? 26;
  const pressure = query.units === "metric" ? 1012 + (seed % 7) : 29.8 + ((seed % 5) * 0.1);
  const visibility = query.units === "metric" ? 9 + (seed % 5) : 5 + (seed % 3);
  const locationLabel = query.label ?? preset.label;

  const report: WeatherReport = {
    source: "mock",
    sourceDetail:
      "WEATHER_AI_API_KEY is not set yet, so the dashboard is running with seeded demo data that matches the selected location profile.",
    generatedAt: new Date().toISOString(),
    units: query.units,
    summary: query.ai
      ? `${locationLabel} is tracking a balanced weather window with the strongest rain signal in the late afternoon. Good conditions hold through the morning before showers rebuild.`
      : "AI narrative is off. Core forecast metrics remain live and the operational briefing stays current.",
    location: {
      label: locationLabel,
      region: preset.region,
      country: preset.country,
      lat: query.lat,
      lon: query.lon,
      timezone: query.timezone ?? preset.timezone,
    },
    current: {
      temperature,
      apparentTemperature,
      condition: chooseCondition(precipitationChance),
      description: `Steady airflow with ${precipitationChance}% rain potential.`,
      humidity,
      windSpeed,
      precipitationChance,
      pressure: round(pressure),
      uvIndex: 4 + (seed % 5),
      visibility: round(visibility),
      sunrise: "06:18",
      sunset: "18:47",
    },
    hourly,
    daily,
    insights: [],
  };

  report.insights = buildWeatherInsights(report);
  return report;
}

export function buildDefaultQuery(): WeatherQuery {
  return {
    lat: DEFAULT_PRESET.lat,
    lon: DEFAULT_PRESET.lon,
    units: "metric",
    days: 7,
    ai: true,
    label: DEFAULT_PRESET.label,
    timezone: DEFAULT_PRESET.timezone,
  };
}

export function formatDayLabel(date: string): string {
  const parsed = new Date(`${date}T00:00:00`);
  return DAY_NAMES[parsed.getDay()] ?? "Day";
}
