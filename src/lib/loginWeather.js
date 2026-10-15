// Current weather and today's forecast for the login screen (Isabela City,
// Basilan) from Open-Meteo, a free service that needs no API key. Only the
// school's fixed coordinates are sent. Decorative only: callers fall back to
// a clear sky when this fails (e.g. offline).

const WEATHER_URL =
  "https://api.open-meteo.com/v1/forecast" +
  "?latitude=6.7013&longitude=121.9711" +
  "&current=weather_code,temperature_2m" +
  "&hourly=weather_code,temperature_2m" +
  "&forecast_days=1&timezone=Asia%2FManila";

export const FORECAST_SLOTS = [
  { key: "morning", name: "Morning", hour: 8 },
  { key: "noon", name: "Noon", hour: 12 },
  { key: "afternoon", name: "Afternoon", hour: 15 },
];

// WMO weather codes grouped into the conditions the scene can draw.
export function describeWeatherCode(code) {
  if (code === 0 || code === 1) return { condition: "clear", label: "Clear" };
  if (code === 2) return { condition: "partly", label: "Partly cloudy" };
  if (code === 3) return { condition: "cloudy", label: "Cloudy" };
  if (code === 45 || code === 48) return { condition: "cloudy", label: "Fog" };
  if (code >= 51 && code <= 57) return { condition: "drizzle", label: "Drizzle" };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) {
    return {
      condition: "rain",
      label: code === 61 || code === 80 ? "Light rain" : "Rain",
    };
  }
  if (code >= 95) return { condition: "storm", label: "Thunderstorm" };
  return { condition: "cloudy", label: "Cloudy" };
}

export async function fetchLoginWeather(signal) {
  const response = await fetch(WEATHER_URL, { signal });
  if (!response.ok) throw new Error(`Weather request failed (${response.status})`);
  const data = await response.json();

  const current = {
    ...describeWeatherCode(data.current.weather_code),
    temperature: Math.round(data.current.temperature_2m),
  };

  // Hourly times are local ("2026-10-16T08:00"), so match on the hour.
  const forecast = FORECAST_SLOTS.map((slot) => {
    const index = data.hourly.time.findIndex(
      (time) => Number(time.slice(11, 13)) === slot.hour,
    );
    if (index < 0) return { ...slot, available: false };
    return {
      ...slot,
      available: true,
      ...describeWeatherCode(data.hourly.weather_code[index]),
      temperature: Math.round(data.hourly.temperature_2m[index]),
    };
  });

  return { current, forecast };
}
