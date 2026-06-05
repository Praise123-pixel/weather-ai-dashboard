import type { WeatherInsight, WeatherReport } from "@/lib/weather-types";

export function buildWeatherInsights(
  report: Pick<WeatherReport, "current" | "daily" | "hourly" | "units">,
): WeatherInsight[] {
  const wettestHour = report.hourly.reduce((best, hour) =>
    hour.precipitationChance > best.precipitationChance ? hour : best,
  );
  const warmestDay = report.daily.reduce((best, day) =>
    day.max > best.max ? day : best,
  );
  const coolestDay = report.daily.reduce((best, day) =>
    day.min < best.min ? day : best,
  );

  const windTone =
    report.current.windSpeed >= (report.units === "metric" ? 25 : 15)
      ? "alert"
      : report.current.windSpeed >= (report.units === "metric" ? 16 : 10)
        ? "watch"
        : "steady";

  const rainTone =
    wettestHour.precipitationChance >= 65
      ? "alert"
      : wettestHour.precipitationChance >= 35
        ? "watch"
        : "steady";

  const swing = warmestDay.max - coolestDay.min;
  const swingTone = swing >= (report.units === "metric" ? 10 : 18) ? "watch" : "steady";

  return [
    {
      title: "Rain window",
      value: `${wettestHour.precipitationChance}%`,
      detail: `Highest rain signal arrives around ${wettestHour.time}.`,
      tone: rainTone,
    },
    {
      title: "Wind posture",
      value: report.units === "metric"
        ? `${Math.round(report.current.windSpeed)} km/h`
        : `${Math.round(report.current.windSpeed)} mph`,
      detail: "Useful for outdoor planning, transit, and field operations.",
      tone: windTone,
    },
    {
      title: "Thermal swing",
      value: report.units === "metric"
        ? `${Math.round(swing)} C`
        : `${Math.round(swing)} F`,
      detail: `Expect the widest spread between ${coolestDay.date} and ${warmestDay.date}.`,
      tone: swingTone,
    },
  ];
}
