// studio/src/i18n/types.ts
import type { EN } from "./strings.en";

export type StudioKey = keyof typeof EN;
export type StudioStrings = Record<StudioKey, string>;

export type StudioI18nValue = {
  locale: string;
  t: (key: StudioKey, params?: Record<string, string | number>) => string;
};
