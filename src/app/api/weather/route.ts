import { getWeatherReport } from "@/lib/weather-ai";
import { buildWeatherQueryFromSearchParams } from "@/lib/weather-query";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const report = await getWeatherReport(buildWeatherQueryFromSearchParams(url.searchParams));
  const cacheControl =
    report.source === "live"
      ? "public, s-maxage=180, stale-while-revalidate=60"
      : "no-store";

  return Response.json(report, {
    headers: {
      "Cache-Control": cacheControl,
    },
  });
}
