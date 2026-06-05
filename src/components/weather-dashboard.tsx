"use client";

import {
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import styles from "./weather-dashboard.module.css";
import { formatDayLabel } from "@/lib/mock-weather";
import type {
  LocationPreset,
  Units,
  WeatherQuery,
  WeatherReport,
} from "@/lib/weather-types";

type Props = {
  initialQuery: WeatherQuery;
  initialReport: WeatherReport;
  presets: LocationPreset[];
};

type CoordinatesDraft = {
  lat: string;
  lon: string;
};

function formatTemperature(value: number, units: Units): string {
  return `${Math.round(value)} ${units === "metric" ? "C" : "F"}`;
}

function formatWind(value: number, units: Units): string {
  return `${Math.round(value)} ${units === "metric" ? "km/h" : "mph"}`;
}

function formatVisibility(value: number, units: Units): string {
  return `${Math.round(value)} ${units === "metric" ? "km" : "mi"}`;
}

function formatChance(value: number): string {
  return `${Math.round(value)}%`;
}

function formatCoordinates(value: number): string {
  return value.toFixed(4);
}

function buildChart(hourly: WeatherReport["hourly"]): { line: string; area: string } {
  const points = hourly.slice(0, 8);
  if (points.length === 0) {
    return { line: "", area: "" };
  }

  const width = 640;
  const height = 190;
  const padding = 18;
  const temperatures = points.map((point) => point.temperature);
  const min = Math.min(...temperatures);
  const max = Math.max(...temperatures);
  const range = Math.max(max - min, 1);

  const coords = points.map((point, index) => {
    const x = padding + (index * (width - padding * 2)) / Math.max(points.length - 1, 1);
    const y =
      padding +
      ((max - point.temperature) / range) * (height - padding * 2);
    return { x, y };
  });

  const line = coords
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
  const area = `${line} L ${coords.at(-1)?.x ?? width - padding} ${height - padding} L ${
    coords[0]?.x ?? padding
  } ${height - padding} Z`;

  return { line, area };
}

function makeDraft(query: WeatherQuery): CoordinatesDraft {
  return {
    lat: query.lat.toFixed(4),
    lon: query.lon.toFixed(4),
  };
}

export function WeatherDashboard({
  initialQuery,
  initialReport,
  presets,
}: Props) {
  const [query, setQuery] = useState<WeatherQuery>(initialQuery);
  const [report, setReport] = useState<WeatherReport>(initialReport);
  const [draft, setDraft] = useState<CoordinatesDraft>(makeDraft(initialQuery));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locationNote, setLocationNote] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query);
  const firstRender = useRef(true);

  const chart = useMemo(() => buildChart(report.hourly), [report.hourly]);
  const activePreset = presets.find(
    (preset) =>
      Math.abs(preset.lat - query.lat) < 0.01 && Math.abs(preset.lon - query.lon) < 0.01,
  );

  const refreshWeather = useEffectEvent(async (nextQuery: WeatherQuery) => {
    setIsLoading(true);
    setError(null);

    const params = new URLSearchParams({
      lat: nextQuery.lat.toString(),
      lon: nextQuery.lon.toString(),
      days: nextQuery.days.toString(),
      units: nextQuery.units,
      ai: String(nextQuery.ai),
      label: nextQuery.label ?? "",
      timezone: nextQuery.timezone ?? "",
    });

    try {
      const response = await fetch(`/api/weather?${params.toString()}`, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Dashboard request failed with ${response.status}`);
      }

      const nextReport = (await response.json()) as WeatherReport;
      setReport(nextReport);
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Unable to refresh weather data right now.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  });

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }

    void refreshWeather(deferredQuery);
  }, [deferredQuery]);

  const handlePreset = (preset: LocationPreset): void => {
    setLocationNote(null);
    startTransition(() => {
      const nextQuery: WeatherQuery = {
        ...query,
        lat: preset.lat,
        lon: preset.lon,
        label: preset.label,
        timezone: preset.timezone,
      };
      setQuery(nextQuery);
      setDraft(makeDraft(nextQuery));
    });
  };

  const handleUnits = (units: Units): void => {
    startTransition(() => {
      setQuery((current) => ({
        ...current,
        units,
      }));
    });
  };

  const handleAiToggle = (): void => {
    startTransition(() => {
      setQuery((current) => ({
        ...current,
        ai: !current.ai,
      }));
    });
  };

  const handleDraftChange = (field: keyof CoordinatesDraft, value: string): void => {
    setDraft((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleCoordinateSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();

    const lat = Number(draft.lat);
    const lon = Number(draft.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      setError("Enter valid latitude and longitude values before updating the map.");
      return;
    }

    setLocationNote("Custom coordinates applied.");
    startTransition(() => {
      setQuery((current) => ({
        ...current,
        lat,
        lon,
        label: "Custom coordinates",
      }));
    });
  };

  const handleUseMyLocation = (): void => {
    if (!navigator.geolocation) {
      setError("Geolocation is not available in this browser.");
      return;
    }

    setLocationNote("Trying to lock your current position.");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextQuery: WeatherQuery = {
          ...query,
          lat: Number(position.coords.latitude.toFixed(4)),
          lon: Number(position.coords.longitude.toFixed(4)),
          label: "Your location",
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        };

        startTransition(() => {
          setQuery(nextQuery);
          setDraft(makeDraft(nextQuery));
        });
        setLocationNote("Using browser coordinates for a local briefing.");
      },
      () => {
        setLocationNote(null);
        setError("Location permission was denied, so the dashboard stayed on the current forecast.");
      },
      { enableHighAccuracy: true, timeout: 12000 },
    );
  };

  const highlights = [
    {
      label: "Feels like",
      value: formatTemperature(report.current.apparentTemperature, report.units),
      detail: "Human comfort index after humidity and airflow adjustments.",
    },
    {
      label: "Humidity",
      value: `${report.current.humidity}%`,
      detail: "Useful for planning commutes, fieldwork, and indoor comfort.",
    },
    {
      label: "Pressure",
      value: `${Math.round(report.current.pressure)} ${report.units === "metric" ? "mb" : "in"}`,
      detail: "Pressure shifts often signal incoming cloud buildup or clearing.",
    },
    {
      label: "Visibility",
      value: formatVisibility(report.current.visibility, report.units),
      detail: "Road and outdoor visibility estimate for the active weather window.",
    },
  ];

  const dayRange = {
    min: Math.min(...report.daily.map((day) => day.min)),
    max: Math.max(...report.daily.map((day) => day.max)),
  };

  return (
    <main className={styles.shell}>
      <section className={styles.hero}>
        <div className={styles.heroTop}>
          <div>
            <span className={styles.eyebrow}>Weather-AI assessment build</span>
            <h1 className={styles.title}>Monsoon Brief</h1>
            <p className={styles.subtitle}>
              Track current conditions, short-term changes, and weekly outlooks in one clear weather brief.
            </p>
          </div>

          <div className={styles.sourceBadge}>
            {report.source === "live" ? "Live Weather-AI feed" : "Demo-safe mode"}
            <span className={styles.sourceDetail}>{report.sourceDetail}</span>
          </div>
        </div>

        <div className={styles.controlDeck}>
          <div className={styles.controlPanel}>
            <p className={styles.panelLabel}>Forecast controls</p>

            <div className={styles.presetRow}>
              {presets.map((preset) => {
                const isActive = activePreset?.id === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    className={`${styles.presetButton} ${isActive ? styles.presetButtonActive : ""}`}
                    onClick={() => handlePreset(preset)}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>

            <div className={styles.controlRow}>
              <button
                type="button"
                className={`${styles.toggleButton} ${
                  query.units === "metric" ? styles.toggleButtonActive : ""
                }`}
                onClick={() => handleUnits("metric")}
              >
                Metric
              </button>
              <button
                type="button"
                className={`${styles.toggleButton} ${
                  query.units === "imperial" ? styles.toggleButtonActive : ""
                }`}
                onClick={() => handleUnits("imperial")}
              >
                Imperial
              </button>
              <button
                type="button"
                className={`${styles.toggleButton} ${query.ai ? styles.toggleButtonActive : ""}`}
                onClick={handleAiToggle}
              >
                {query.ai ? "AI summary on" : "AI summary off"}
              </button>
              <button type="button" className={styles.ghostButton} onClick={handleUseMyLocation}>
                Use my location
              </button>
            </div>

            <form className={styles.coordinateForm} onSubmit={handleCoordinateSubmit}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Latitude</span>
                <input
                  className={styles.input}
                  inputMode="decimal"
                  value={draft.lat}
                  onChange={(event) => handleDraftChange("lat", event.target.value)}
                />
              </label>

              <label className={styles.field}>
                <span className={styles.fieldLabel}>Longitude</span>
                <input
                  className={styles.input}
                  inputMode="decimal"
                  value={draft.lon}
                  onChange={(event) => handleDraftChange("lon", event.target.value)}
                />
              </label>

              <button type="submit" className={styles.submitButton}>
                Refresh briefing
              </button>
            </form>
          </div>

          <div className={styles.overviewPanel}>
            <div className={styles.locationRow}>
              <div>
                <p className={styles.panelLabel}>Now monitoring</p>
                <h2 className={styles.condition}>
                  {report.location.label}, {report.location.country}
                </h2>
                <p className={styles.locationCaption}>
                  {report.location.region} | {formatCoordinates(report.location.lat)},{` `}
                  {formatCoordinates(report.location.lon)}
                </p>
              </div>

              <div>
                <div className={styles.status}>
                  <span className={styles.statusDot} />
                  {isLoading ? "Refreshing data..." : "Forecast synced"}
                </div>
              </div>
            </div>

            <div className={styles.temperature}>
              {Math.round(report.current.temperature)}
              <span className={styles.temperatureUnit}>
                {report.units === "metric" ? "C" : "F"}
              </span>
            </div>

            <p className={styles.condition}>{report.current.condition}</p>
            <p className={styles.summary}>{report.summary}</p>

            <div className={styles.metricGrid}>
              <div className={styles.metricCard}>
                <p className={styles.metricTitle}>Rain chance</p>
                <p className={styles.metricValue}>{formatChance(report.current.precipitationChance)}</p>
                <p className={styles.metricDetail}>Near-term precipitation confidence.</p>
              </div>
              <div className={styles.metricCard}>
                <p className={styles.metricTitle}>Wind</p>
                <p className={styles.metricValue}>{formatWind(report.current.windSpeed, report.units)}</p>
                <p className={styles.metricDetail}>Useful for travel and outdoor activity.</p>
              </div>
              <div className={styles.metricCard}>
                <p className={styles.metricTitle}>Sunrise</p>
                <p className={styles.metricValue}>{report.current.sunrise}</p>
                <p className={styles.metricDetail}>Morning light window.</p>
              </div>
              <div className={styles.metricCard}>
                <p className={styles.metricTitle}>Sunset</p>
                <p className={styles.metricValue}>{report.current.sunset}</p>
                <p className={styles.metricDetail}>Evening wrap-up for the day.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.contentGrid}>
        <div className={styles.card}>
          <div className={styles.sectionHeader}>
            <div>
              <h3 className={styles.sectionTitle}>Hourly temperature pulse</h3>
              <p className={styles.sectionCaption}>
                The next eight checkpoints show how the thermal curve and rain risk stack up across the day.
              </p>
            </div>
            <div className={styles.footnote}>
              Updated {new Date(report.generatedAt).toLocaleTimeString("en-US", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          </div>

          <div className={styles.chart}>
            <svg className={styles.svg} viewBox="0 0 640 190" role="img" aria-label="Hourly temperature chart">
              <defs>
                <linearGradient id="weather-area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(96, 209, 216, 0.34)" />
                  <stop offset="100%" stopColor="rgba(96, 209, 216, 0)" />
                </linearGradient>
                <linearGradient id="weather-line" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#4bc4c8" />
                  <stop offset="100%" stopColor="#ffb85c" />
                </linearGradient>
              </defs>
              <path d={chart.area} fill="url(#weather-area)" />
              <path
                d={chart.line}
                fill="none"
                stroke="url(#weather-line)"
                strokeWidth="5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>

            <div className={styles.chartMeta}>
              <span>Peak: {formatTemperature(Math.max(...report.hourly.map((hour) => hour.temperature)), report.units)}</span>
              <span>Low: {formatTemperature(Math.min(...report.hourly.map((hour) => hour.temperature)), report.units)}</span>
              <span>AI layer: {query.ai ? "Enabled" : "Disabled"}</span>
            </div>
          </div>

          <div className={styles.hourlyGrid}>
            {report.hourly.slice(0, 8).map((hour) => (
              <div key={hour.time} className={styles.hourlyTile}>
                <p className={styles.hourlyTime}>{hour.time}</p>
                <p className={styles.hourlyTemp}>{formatTemperature(hour.temperature, report.units)}</p>
                <p className={styles.hourlyRain}>{formatChance(hour.precipitationChance)} rain chance</p>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.sectionHeader}>
            <div>
              <h3 className={styles.sectionTitle}>Operational insights</h3>
              <p className={styles.sectionCaption}>
                Compact signals designed to feel useful in a real product, not just visually impressive.
              </p>
            </div>
          </div>

          <div className={styles.insightList}>
            {report.insights.map((insight) => (
              <div
                key={insight.title}
                className={`${styles.insightCard} ${
                  insight.tone === "steady"
                    ? styles.insightToneSteady
                    : insight.tone === "watch"
                      ? styles.insightToneWatch
                      : styles.insightToneAlert
                }`}
              >
                <p className={styles.insightTitle}>{insight.title}</p>
                <p className={styles.insightValue}>{insight.value}</p>
                <p className={styles.insightDetail}>{insight.detail}</p>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.sectionHeader}>
            <div>
              <h3 className={styles.sectionTitle}>Seven-day runway</h3>
              <p className={styles.sectionCaption}>
                A compact forecast strip with temperature spread and precipitation posture for each day.
              </p>
            </div>
          </div>

          <div className={styles.dailyStrip}>
            {report.daily.map((day) => {
              const left = ((day.min - dayRange.min) / Math.max(dayRange.max - dayRange.min, 1)) * 100;
              const width = ((day.max - day.min) / Math.max(dayRange.max - dayRange.min, 1)) * 100;

              return (
                <div key={day.date} className={styles.dayRow}>
                  <div>
                    <p className={styles.dayName}>{formatDayLabel(day.date)}</p>
                    <p className={styles.dayCondition}>{day.condition}</p>
                  </div>

                  <div className={styles.rangeTrack}>
                    <span
                      className={styles.rangeBar}
                      style={{
                        left: `${left}%`,
                        width: `${Math.max(width, 12)}%`,
                      }}
                    />
                  </div>

                  <div className={styles.dayTemps}>
                    {Math.round(day.min)} / {Math.round(day.max)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.sectionHeader}>
            <div>
              <h3 className={styles.sectionTitle}>Highlights</h3>
              <p className={styles.sectionCaption}>
                Secondary conditions that make the dashboard feel complete and decision-ready.
              </p>
            </div>
          </div>

          <div className={styles.highlightsGrid}>
            {highlights.map((highlight) => (
              <div key={highlight.label} className={styles.highlightCard}>
                <p className={styles.highlightLabel}>{highlight.label}</p>
                <p className={styles.highlightValue}>{highlight.value}</p>
                <p className={styles.highlightDetail}>{highlight.detail}</p>
              </div>
            ))}
          </div>

          <p className={styles.footnote}>
            Timezone: {report.location.timezone} | UV index {report.current.uvIndex} | Visibility cue {report.current.description}
          </p>
        </div>
      </section>

      {(error || locationNote) && (
        <section className={styles.card} style={{ marginTop: 22 }}>
          <div className={styles.sectionHeader}>
            <div>
              <h3 className={styles.sectionTitle}>Runtime notes</h3>
              <p className={styles.sectionCaption}>
                Helpful feedback while switching coordinates, toggling units, or testing browser geolocation.
              </p>
            </div>
          </div>

          {error ? <p className={styles.highlightDetail}>{error}</p> : null}
          {locationNote ? <p className={styles.highlightDetail}>{locationNote}</p> : null}
        </section>
      )}
    </main>
  );
}
