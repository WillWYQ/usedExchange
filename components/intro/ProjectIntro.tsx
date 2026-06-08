"use client";

import { useLocale } from "@/components/i18n/useLocale";
import { getProjectIntroCopy } from "./projectIntro.dictionary";

// Introduces the UsedExchange template itself — shown at "/" before the
// seller has configured their store (see app/page.tsx + lib/utils/templateStatus.ts),
// and permanently at "/about" afterwards so visitors can still learn what
// the project is. Copy is self-contained and ships in six languages
// (see projectIntro.dictionary.ts) independent of the seller's own i18n setup.
export function ProjectIntro() {
  const { locale } = useLocale();
  const copy = getProjectIntroCopy(locale);

  return (
    <div className="mx-auto max-w-3xl">
      {/* ── Hero ── */}
      <section className="mb-16 text-center">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/40">
          {copy.eyebrow}
        </p>
        <h1 className="mb-4 text-4xl font-bold tracking-tight text-white sm:text-5xl">
          {copy.title}
        </h1>
        <p className="mx-auto mb-6 max-w-xl text-lg text-white/60">
          {copy.tagline}
        </p>
        <p className="mx-auto max-w-xl rounded-xl bg-white/5 px-5 py-4 text-sm text-white/50 ring-1 ring-white/10">
          {copy.intro}
        </p>
      </section>

      {/* ── Features ── */}
      <section className="mb-16">
        <h2 className="mb-5 text-xl font-semibold text-white">
          {copy.featuresTitle}
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2">
          {copy.features.map((feature) => (
            <li
              key={feature.title}
              className="rounded-xl bg-white/5 p-5 ring-1 ring-white/10"
            >
              <h3 className="mb-1.5 text-sm font-semibold text-white">
                {feature.title}
              </h3>
              <p className="text-sm leading-relaxed text-white/55">
                {feature.description}
              </p>
            </li>
          ))}
        </ul>
      </section>

      {/* ── UI customisability spotlight ── */}
      <section className="mb-16">
        <h2 className="mb-2 text-xl font-semibold text-white">
          {copy.uiTitle}
        </h2>
        <p className="mb-5 text-sm leading-relaxed text-white/55">
          {copy.uiDescription}
        </p>
        <ul className="grid gap-4 sm:grid-cols-2">
          {copy.uiSlots.map((slot) => (
            <li
              key={slot.name}
              className="rounded-xl border border-dashed border-white/15 p-5"
            >
              <h3 className="mb-1.5 text-sm font-semibold text-white">
                {slot.name}
              </h3>
              <p className="text-sm leading-relaxed text-white/55">
                {slot.description}
              </p>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Get started ── */}
      <section>
        <h2 className="mb-5 text-xl font-semibold text-white">
          {copy.getStartedTitle}
        </h2>
        <ol className="space-y-3">
          {copy.getStartedSteps.map((step, index) => (
            <li key={step} className="flex gap-4 text-sm text-white/60">
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-white/70"
                aria-hidden="true"
              >
                {index + 1}
              </span>
              <span className="leading-relaxed">{step}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
