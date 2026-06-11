"use client";

import { useState, useCallback, useRef } from "react";
import type { Weight, Dimensions } from "@/lib/content/types";
import type { ShippingRate } from "@/lib/utils/shipping";

type ShippingRateState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; rate: ShippingRate }
  | { status: "error" };

type UseShippingRateResult = {
  state: ShippingRateState;
  // Fetches a rate for the given destination ZIP. Aborts any in-flight request.
  // Passing an empty/whitespace-only ZIP resets state to "idle".
  fetchRate: (destinationZip: string) => void;
};

// Calls the seller's Cloudflare Worker proxy (siteConfig.shipping.proxyUrl).
// The proxy holds the carrier API key — never call Shippo/EasyPost directly
// from the browser. Buyer ZIP lives in component state only; never persisted
// (same privacy guarantee as useGeolocation — see DESIGN.md §17/§21).
export function useShippingRate(
  proxyUrl: string,
  weight: Weight,
  dimensions: Dimensions,
  destinationCountry: string,
  currency: string,
): UseShippingRateResult {
  const [state, setState] = useState<ShippingRateState>({ status: "idle" });
  const abortRef = useRef<AbortController | null>(null);

  const fetchRate = useCallback(
    (destinationZip: string) => {
      abortRef.current?.abort();

      const zip = destinationZip.trim();
      if (!zip) {
        setState({ status: "idle" });
        return;
      }

      const controller = new AbortController();
      abortRef.current = controller;
      setState({ status: "loading" });

      fetch(proxyUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destinationZip: zip,
          destinationCountry,
          weight,
          dimensions,
          currency,
        }),
        signal: controller.signal,
      })
        .then((res) => {
          if (!res.ok) throw new Error(`Rate request failed: ${res.status}`);
          return res.json() as Promise<ShippingRate>;
        })
        .then((rate) => setState({ status: "ready", rate }))
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === "AbortError") return;
          setState({ status: "error" });
        });
    },
    [proxyUrl, weight, dimensions, destinationCountry, currency],
  );

  return { state, fetchRate };
}
