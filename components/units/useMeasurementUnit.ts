"use client";

import { useMeasurementUnitContext } from "./MeasurementUnitProvider";

export function useMeasurementUnit() {
  return useMeasurementUnitContext();
}
