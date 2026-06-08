"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { IconBrandGithub } from "@tabler/icons-react";
import { useLocale } from "@/components/i18n/useLocale";
import {
  PROJECT_INTRO_LOCALES,
  getProjectIntroCopy,
  type ProjectIntroLocale,
} from "./projectIntro.dictionary";

// Decorative effects pull in framer-motion / three.js — load client-side only,
// same pattern as components/ui-adapters/{BackgroundEffect,ItemCardAdapter}.
const Spotlight = dynamic(
  () => import("@/components/ui/spotlight-new").then((m) => m.Spotlight),
  { ssr: false },
);
const CardSpotlight = dynamic(
  () => import("@/components/ui/card-spotlight").then((m) => m.CardSpotlight),
  { ssr: false },
);

// Canonical source repo for the template — shown as a "fork this" link before
// setup, and as a "view the source" link from /about afterwards.
const TEMPLATE_REPO_URL = "https://github.com/WillWYQ/usedExchange";

const LOCALE_NAMES: Record<ProjectIntroLocale, string> = {
  en: "English",
  zh: "中文",
  fr: "Français",
  es: "Español",
  ja: "日本語",
  ko: "한국어",
};

// Introduces the UsedExchange template itself — shown at "/" before the
// seller has configured their store (see app/page.tsx + lib/utils/templateStatus.ts),
// and permanently at "/about" afterwards so visitors can still learn what
// the project is.
//
// Its language switcher is intentionally independent from the global
// LocaleProvider: that context is gated by siteConfig.i18n.availableLocales
// (the seller's own choice for their listings, often just one locale), while
// this page ships translations for six major languages regardless — see
// projectIntro.dictionary.ts. It still seeds its initial pick from the active
// site locale when that happens to be one of the six.
export function ProjectIntro() {
  const { locale: siteLocale } = useLocale();
  const [locale, setLocale] = useState<ProjectIntroLocale>(() =>
    (PROJECT_INTRO_LOCALES as readonly string[]).includes(siteLocale)
      ? (siteLocale as ProjectIntroLocale)
      : "en",
  );
  const copy = getProjectIntroCopy(locale);

  return (
    <div className="mx-auto max-w-3xl">
      {/* ── Hero ── */}
      <section className="relative mb-16 overflow-hidden rounded-3xl px-6 py-16 text-center ring-1 ring-white/10">
        <Spotlight />
        <div className="relative z-10">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/40">
            {copy.eyebrow}
          </p>
          <h1 className="mb-4 text-4xl font-bold tracking-tight text-white sm:text-5xl">
            {copy.title}
          </h1>
          <p className="mx-auto mb-8 max-w-xl text-lg text-white/60">
            {copy.tagline}
          </p>

          {/* GitHub link */}
          <a
            href={TEMPLATE_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mb-8 inline-flex items-center gap-2 rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-black transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black"
          >
            <IconBrandGithub size={18} stroke={2} aria-hidden="true" />
            {copy.githubLabel}
          </a>

          {/* In-page language switcher — six languages, independent of siteConfig.i18n */}
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-widest text-white/30">
              {copy.languageLabel}
            </p>
            <div
              className="flex flex-wrap items-center justify-center gap-1.5"
              role="group"
              aria-label={copy.languageLabel}
            >
              {PROJECT_INTRO_LOCALES.map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setLocale(code)}
                  aria-pressed={locale === code}
                  className={[
                    "rounded-full px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black",
                    locale === code
                      ? "bg-white text-black"
                      : "bg-white/5 text-white/60 ring-1 ring-white/10 hover:text-white",
                  ].join(" ")}
                >
                  {LOCALE_NAMES[code]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── About this page ── */}
      <p className="mx-auto mb-16 max-w-xl rounded-xl bg-white/5 px-5 py-4 text-center text-sm text-white/50 ring-1 ring-white/10">
        {copy.intro}
      </p>

      {/* ── Features ── */}
      <section className="mb-16">
        <h2 className="mb-5 text-xl font-semibold text-white">
          {copy.featuresTitle}
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2">
          {copy.features.map((feature) => (
            <li
              key={feature.title}
              className="rounded-xl bg-white/5 p-5 ring-1 ring-white/10 transition-all duration-200 hover:bg-white/[0.07] hover:ring-white/25"
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
            <li key={slot.name}>
              <CardSpotlight
                radius={220}
                color="#ffffff"
                className="h-full border-white/10 bg-white/5 p-5"
              >
                <h3 className="relative z-20 mb-1.5 text-sm font-semibold text-white">
                  {slot.name}
                </h3>
                <p className="relative z-20 text-sm leading-relaxed text-white/55">
                  {slot.description}
                </p>
              </CardSpotlight>
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
