"use client";

import { useState, useEffect } from "react";
import type { GeolocationState } from "@/lib/content/types";

// Requests the visitor's location once on mount via the Geolocation API.
// "idle" is the initial value; the hook transitions to "pending" inside the
// first useEffect so "idle" is never user-visible — treat it the same as
// "pending" in all rendering code (see DESIGN.md §17).
export function useGeolocation(): GeolocationState {
  const [state, setState] = useState<GeolocationState>({ status: "idle" });

  useEffect(() => {
    if (!navigator.geolocation) {
      setState({ status: "unavailable" });
      return;
    }

    setState({ status: "pending" });

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setState({
          status: "granted",
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      () => {
        setState({ status: "denied" });
      },
      {
        enableHighAccuracy: false,
        timeout: 10_000,
        maximumAge: 300_000, // reuse cached position for up to 5 min (no second prompt)
      },
    );
  }, []);

  return state;
}
