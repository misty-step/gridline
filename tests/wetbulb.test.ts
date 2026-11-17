import { describe, expect, test } from "bun:test";
import {
  celsiusToFahrenheit,
  classifyThermalRegime,
  computeWetBulbC,
} from "../src/shared/wetbulb.ts";

describe("Stull (2011) wet-bulb calculation", () => {
  test("matches Stull (2011) benchmark values and psychrometric error envelope", () => {
    // Stull (2011) canonical example: 20°C, 50% RH -> 13.7°C
    expect(computeWetBulbC(20, 50)).toBe(13.7);

    // 30°C, 80% RH -> 27.1°C
    expect(computeWetBulbC(30, 80)).toBe(27.1);

    // 5°C, 40% RH -> 0.1°C (within Stull 2011 [-1.0, +0.65]°C psychrometric envelope vs ~0.7°C)
    const wb3 = computeWetBulbC(5, 40);
    expect(wb3).toBe(0.1);
    expect(Math.abs((wb3 as number) - 0.7)).toBeLessThan(1.0);
  });

  test("handles saturated and invalid inputs safely", () => {
    const saturated = computeWetBulbC(22, 100);
    expect(saturated).not.toBeNull();
    expect(Math.abs((saturated as number) - 22)).toBeLessThan(0.5);

    expect(computeWetBulbC(null, 50)).toBeNull();
    expect(computeWetBulbC(20, null)).toBeNull();
    expect(computeWetBulbC(Number.NaN, 50)).toBeNull();
    expect(computeWetBulbC(20, -1)).toBeNull();
    expect(computeWetBulbC(20, 120)).toBeNull();
  });

  test("converts Celsius to Fahrenheit accurately", () => {
    expect(celsiusToFahrenheit(0)).toBe(32);
    expect(celsiusToFahrenheit(20)).toBe(68);
    expect(celsiusToFahrenheit(100)).toBe(212);
  });

  test("classifies thermal regimes across boundaries", () => {
    expect(classifyThermalRegime(null)).toBe("unavailable");
    expect(classifyThermalRegime(12.9)).toBe("free_economizer");
    expect(classifyThermalRegime(13)).toBe("adiabatic_assist");
    expect(classifyThermalRegime(20)).toBe("adiabatic_assist");
    expect(classifyThermalRegime(20.1)).toBe("peak_chiller_evap");
  });
});
