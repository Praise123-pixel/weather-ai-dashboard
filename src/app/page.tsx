import { WeatherDashboard } from "@/components/weather-dashboard";
import { buildDefaultQuery, LOCATION_PRESETS } from "@/lib/mock-weather";
import { getWeatherReport } from "@/lib/weather-ai";

export default async function Home() {
  const initialQuery = buildDefaultQuery();
  const initialReport = await getWeatherReport(initialQuery);

  return (
    <WeatherDashboard
      initialQuery={initialQuery}
      initialReport={initialReport}
      presets={LOCATION_PRESETS}
    />
  );
}
