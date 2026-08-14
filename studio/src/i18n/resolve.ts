// studio/src/i18n/resolve.ts
import type { StudioStrings } from "./types";
import { EN } from "./strings.en";
import { ZH } from "./strings.zh";

const BUILTIN: Record<string, Partial<StudioStrings>> = {
  zh: ZH,
};

export function resolveStudioStrings(
  locale: string,
  overrides: Record<string, Record<string, string>>,
): StudioStrings {
  return {
    ...EN,
    ...(BUILTIN[locale] ?? {}),
    ...(overrides[locale] ?? {}),
  } as StudioStrings;
}

export function format(
  template: string,
  params?: Record<string, string | number>,
): string {
  if (!params) return template;
  let result = template;
  for (const [key, value] of Object.entries(params)) {
    result = result.replaceAll(`{${key}}`, String(value));
  }
  // English pluralization: {plural} → "s" when count !== 1
  if (params.count !== undefined) {
    result = result.replace("{plural}", params.count === 1 ? "" : "s");
  }
  return result;
}
