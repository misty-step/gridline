import type { LiveStationWeather } from "./types.ts";

export type ThermalRegime = LiveStationWeather["thermalRegime"];

const round1 = (value: number): number => Math.round(value * 10) / 10;

export function celsiusToFahrenheit(tempC: number): number {
  return round1((tempC * 9) / 5 + 32);
}

/**
 * Stull (2011) empirical wet-bulb temperature approximation from dry-bulb
 * temperature (°C) and relative humidity (%).
 */
export function computeWetBulbC(
  tempC: number | null | undefined,
  relativeHumidityPct: number | null | undefined,
): number | null {
  if (
    tempC === null ||
    tempC === undefined ||
    relativeHumidityPct === null ||
    relativeHumidityPct === undefined ||
    !Number.isFinite(tempC) ||
    !Number.isFinite(relativeHumidityPct)
  ) {
    return null;
  }
  if (relativeHumidityPct < 0 || relativeHumidityPct > 105) {
    return null;
  }

  const rh = Math.min(100, Math.max(0, relativeHumidityPct));
  const t = tempC;

  const tw =
    t * Math.atan(0.151977 * Math.sqrt(rh + 8.313659)) +
    Math.atan(t + rh) -
    Math.atan(rh - 1.676331) +
    0.00391838 * Math.pow(rh, 1.5) * Math.atan(0.023101 * rh) -
    4.686035;

  if (!Number.isFinite(tw)) {
    return null;
  }
  return round1(tw);
}

export function classifyThermalRegime(
  wetBulbC: number | null | undefined,
): ThermalRegime {
  if (wetBulbC === null || wetBulbC === undefined || !Number.isFinite(wetBulbC)) {
    return "unavailable";
  }
  if (wetBulbC < 13) {
    return "free_economizer";
  }
  if (wetBulbC <= 20) {
    return "adiabatic_assist";
  }
  return "peak_chiller_evap";
}
