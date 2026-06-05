import { WeatherDashboard } from "@/components/weather-dashboard";
import { LOCATION_PRESETS } from "@/lib/mock-weather";
import { buildWeatherQueryFromSearchParams } from "@/lib/weather-query";
import { getWeatherReport } from "@/lib/weather-ai";

type PageProps = {
  searchParams?:
    | Promise<Record<string, string | string[] | undefined>>
    | Record<string, string | string[] | undefined>;
};

export default async function Home({ searchParams }: PageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const initialQuery = buildWeatherQueryFromSearchParams(resolvedSearchParams);
  const initialReport = await getWeatherReport(initialQuery);

  return (
    <WeatherDashboard
      initialQuery={initialQuery}
      initialReport={initialReport}
      presets={LOCATION_PRESETS}
    />
  );
}
