// Server component — renders the JSON-LD script tag in <head> or inline.
// See TECH_REQUIREMENTS.md §22.4.
type JsonLdProps = {
  data: Record<string, unknown>;
};

export function JsonLd({ data }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      // dangerouslySetInnerHTML is required for JSON-LD; data is server-generated (no user input).
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
