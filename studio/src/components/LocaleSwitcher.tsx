export function LocaleSwitcher({
  availableLocales,
  value,
  onChange,
}: {
  availableLocales: string[];
  value: string;
  onChange: (locale: string) => void;
}) {
  if (availableLocales.length < 2) return null;
  return (
    <select
      className="locale-switcher"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Display language"
    >
      {availableLocales.map((locale) => (
        <option key={locale} value={locale}>
          {locale.toUpperCase()}
        </option>
      ))}
    </select>
  );
}
