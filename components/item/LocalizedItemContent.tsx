"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useLocale } from "@/components/i18n/useLocale";
import { getLocalizedField } from "@/lib/utils/i18n";
import type { Item } from "@/lib/content/types";

type Props = { item: Item };

// Renders the item <h1> name and Markdown description in the active locale.
// Both re-render instantly on locale switch with no page reload.
// Server-side output always uses defaultLocale (SSG + SEO consistent).
export function LocalizedItemContent({ item }: Props) {
  const { locale } = useLocale();

  const name = getLocalizedField(item, "name", locale);
  const description = getLocalizedField(item, "description", locale);

  return (
    <>
      <h1 className="text-2xl font-bold text-white sm:text-3xl">{name}</h1>

      {description && (
        <div className="prose prose-invert mt-4 max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{description}</ReactMarkdown>
        </div>
      )}
    </>
  );
}
