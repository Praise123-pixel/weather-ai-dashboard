export type Units = "metric" | "imperial";

export type DataSource = "live" | "mock";

export type InsightTone = "steady" | "watch" | "alert";

export type WeatherQuery = {
  lat: number;
  lon: number;
  units: Units;
  days: number;
  ai: boolean;
  label?: string;
  timezone?: string;
};

export type LocationPreset = {
  id: string;
  label: string;
  region: string;
  country: string;
  lat: number;
  lon: number;
  timezone: string;
};

export type WeatherLocation = {
  label: string;
  region: string;
  country: string;
  lat: number;
  lon: number;
  timezone: string;
};

export type CurrentConditions = {
  temperature: number;
  apparentTemperature: number;
  condition: string;
  description: string;
  humidity: number;
  windSpeed: number;
  precipitationChance: number;
  pressure: number;
  uvIndex: number;
  visibility: number;
  sunrise: string;
  sunset: string;
};

export type HourlyPoint = {
  time: string;
  temperature: number;
  precipitationChance: number;
  condition: string;
};

export type DailyPoint = {
  date: string;
  min: number;
  max: number;
  precipitationChance: number;
  condition: string;
  sunrise: string;
  sunset: string;
};

export type WeatherInsight = {
  title: string;
  value: string;
  detail: string;
  tone: InsightTone;
};

export type WeatherReport = {
  source: DataSource;
  sourceDetail: string;
  generatedAt: string;
  units: Units;
  summary: string;
  location: WeatherLocation;
  current: CurrentConditions;
  hourly: HourlyPoint[];
  daily: DailyPoint[];
  insights: WeatherInsight[];
};
