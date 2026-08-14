import { useStudioT } from "../i18n/StudioI18n";

export function LocaleSwitcher({
  availableLocales,
  value,
  onChange,
}: {
  availableLocales: string[];
  value: string;
  onChange: (locale: string) => void;
}) {
  // The hook must run unconditionally, before the early return below.
  const { t } = useStudioT();
  if (availableLocales.length < 2) return null;
  return (
    <select
      className="locale-switcher"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={t("localeSwitcher.aria")}
    >
      {availableLocales.map((locale) => (
        <option key={locale} value={locale}>
          {locale.toUpperCase()}
        </option>
      ))}
    </select>
  );
}
