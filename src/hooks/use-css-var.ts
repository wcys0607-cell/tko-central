"use client";

import { useState, useEffect } from "react";

/**
 * Reads a CSS custom property from :root and returns its computed value as a string.
 * Useful for passing dynamic theme colors to libraries like Recharts that don't support CSS vars.
 */
export function useCssVar(varName: string, fallback: string = "#888888"): string {
  const [value, setValue] = useState(fallback);

  useEffect(() => {
    const style = getComputedStyle(document.documentElement);
    const raw = style.getPropertyValue(varName).trim();
    if (raw) {
      // Create a temporary element to resolve oklch() to a usable color
      const el = document.createElement("div");
      el.style.color = raw;
      document.body.appendChild(el);
      const computed = getComputedStyle(el).color;
      document.body.removeChild(el);

      // Convert rgb(r, g, b) to hex
      const match = computed.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (match) {
        const hex = `#${Number(match[1]).toString(16).padStart(2, "0")}${Number(match[2]).toString(16).padStart(2, "0")}${Number(match[3]).toString(16).padStart(2, "0")}`;
        setValue(hex);
      } else {
        setValue(computed);
      }
    }
  }, [varName]);

  return value;
}

/**
 * Convenience hook for multiple chart colors at once.
 */
export function useChartColors() {
  const chart1 = useCssVar("--chart-1", "#0D7377");
  const chart2 = useCssVar("--chart-2", "#E8A030");
  const chart3 = useCssVar("--chart-3", "#2D9B6E");
  const chart4 = useCssVar("--chart-4", "#6E7BC4");
  const chart5 = useCssVar("--chart-5", "#C46E5A");
  return { chart1, chart2, chart3, chart4, chart5 };
}
