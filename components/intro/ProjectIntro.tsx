"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import { IconBrandGithub } from "@tabler/icons-react";
import { FlipWords } from "@/components/ui/flip-words";
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
const Terminal = dynamic(
  () => import("@/components/ui/terminal").then((m) => m.Terminal),
  { ssr: false },
);
const WobbleCard = dynamic(
  () => import("@/components/ui/wobble-card").then((m) => m.WobbleCard),
  { ssr: false },
);

// Gradient tints for the "What you get" wobble cards — translucent enough to
// sit on either a white or black surface, so the bento grid stays colorful
// (rather than monochrome) across both light and dark themes.
const FEATURE_CARD_TONES = [
  "bg-gradient-to-br from-violet-500/15 via-fuchsia-500/10 to-transparent",
  "bg-gradient-to-br from-cyan-500/15 via-sky-500/10 to-transparent",
  "bg-gradient-to-br from-emerald-500/15 via-teal-500/10 to-transparent",
  "bg-gradient-to-br from-amber-500/15 via-orange-500/10 to-transparent",
  "bg-gradient-to-br from-rose-500/15 via-pink-500/10 to-transparent",
];

// Spotlight glow colors for the UI customisability cards — cycled per item so
// the section reads as colorful rather than a wall of identical white glows.
// Lighter/translucent in light mode so the glow doesn't overpower a white card.
const SPOTLIGHT_COLORS_DARK = ["#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#f43f5e", "#ec4899"];
const SPOTLIGHT_COLORS_LIGHT = ["#c4b5fd", "#a5f3fc", "#a7f3d0", "#fde68a", "#fecdd3", "#fbcfe8"];

// Top-edge accent gradients for the comparison cards — cycled per card.
const COMPARISON_ACCENTS = [
  "from-violet-500 to-fuchsia-500",
  "from-cyan-500 to-sky-500",
];

// The documented seller pipeline (docs/DESIGN.md §14 "Build Pipeline"):
// clone once, then hand off to an AI coding tool (Claude Code, Cursor, …) for
// the /setup and /update-items skills — those are slash commands typed into
// the AI's chat, not shell commands, so "# …" lines narrate the hand-off
// rather than pretending bash understands them. Sync photos, push, and CI
// builds + deploys automatically. Stays in English regardless of page locale,
// like any terminal a seller would actually run.
const WORKFLOW_COMMANDS = [
  "git clone https://github.com/WillWYQ/usedExchange.git my-store && cd my-store",
  "pnpm install",
  "claude # open Claude Code (or Cursor, etc.) in this folder, then type:",
  "/setup",
  "# drop photos into content/items/furniture/ikea-desk/, then type:",
  "/update-items",
  "pnpm upload-images",
  "git add content lib/generated/image-manifest.json && git push",
];
const WORKFLOW_OUTPUTS: Record<number, string[]> = {
  3: [
    "→ AI asks a few questions — store name, location, currency, contact…",
    "✓ Generated content/config.ts + category scaffolding",
  ],
  5: [
    "→ Reading photos + notes from content/items/furniture/ikea-desk/",
    "✓ Generated item.json — review and confirm before saving",
  ],
  6: [
    "[upload-images] provider=cloudflare-r2  uploaded=5  skipped=0  purged=0  total=5  warnings=0",
    "✓ lib/generated/image-manifest.json updated — commit this file",
  ],
  7: [
    "✓ Pushed to origin/main",
    "→ GitHub Actions builds and deploys to GitHub Pages automatically",
  ],
};

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
  const { resolvedTheme } = useTheme();
  const [locale, setLocale] = useState<ProjectIntroLocale>(() =>
    (PROJECT_INTRO_LOCALES as readonly string[]).includes(siteLocale)
      ? (siteLocale as ProjectIntroLocale)
      : "en",
  );
  const copy = getProjectIntroCopy(locale);

  // CardSpotlight's hover glow renders at full color opacity — vivid hues
  // that read as a soft halo on a black surface would overpower a white one,
  // so light mode gets pastel variants of the same palette.
  const spotlightColors = resolvedTheme === "light" ? SPOTLIGHT_COLORS_LIGHT : SPOTLIGHT_COLORS_DARK;

  return (
    <div className="mx-auto max-w-3xl">
      {/* ── Hero ── */}
      <section className="relative mb-16 overflow-hidden rounded-3xl px-6 py-16 text-center ring-1 ring-border">
        {/* Colorful ambient glow behind the spotlight */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,rgba(139,92,246,0.2),transparent_60%),radial-gradient(ellipse_at_bottom_right,rgba(6,182,212,0.15),transparent_55%)]"
        />
        <Spotlight />
        <div className="relative z-10">
          <p className="mb-3 inline-block bg-gradient-to-r from-violet-700 via-fuchsia-700 to-cyan-700 bg-clip-text text-xs font-semibold uppercase tracking-widest text-transparent dark:from-violet-300 dark:via-fuchsia-300 dark:to-cyan-300">
            {copy.eyebrow}
          </p>
          <h1 className="mb-4 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            {copy.title}
          </h1>
          <p className="mx-auto mb-8 max-w-xl text-lg text-foreground/60">
            {copy.tagline}
          </p>

          {/* GitHub link */}
          <a
            href={TEMPLATE_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mb-8 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-cyan-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-500/20 transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <IconBrandGithub size={18} stroke={2} aria-hidden="true" />
            {copy.githubLabel}
          </a>

          {/* In-page language switcher — six languages, independent of siteConfig.i18n */}
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-widest text-foreground/30">
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
                    "rounded-full px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    locale === code
                      ? "bg-gradient-to-r from-violet-500 to-cyan-500 text-white"
                      : "bg-foreground/5 text-foreground/60 ring-1 ring-border hover:text-foreground",
                  ].join(" ")}
                >
                  {LOCALE_NAMES[code]}
                </button>
              ))}
            </div>
          </div>

          {/* ── Why use this template ── */}
          <div className="mt-12">
            <h2 className="mb-4 text-center text-xl font-semibold text-foreground">
              {copy.whyTitle}
            </h2>
            <p className="text-center text-2xl font-medium leading-relaxed text-foreground/70 sm:text-3xl">
              {copy.whyPrefix}
            </p>
            <div className="flex justify-center text-2xl font-semibold leading-relaxed sm:text-3xl">
              <FlipWords
                key={locale}
                words={copy.whyWords}
                className="text-violet-700 dark:text-violet-300"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── Why not just use a spreadsheet or marketplace app ── */}
      <section className="mb-16">
        <h2 className="mb-5 text-xl font-semibold text-foreground">
          {copy.whyComparisonsTitle}
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2">
          {copy.whyComparisons.map((comparison, index) => (
            <li
              key={comparison.title}
              className="overflow-hidden rounded-xl bg-foreground/5 ring-1 ring-border"
            >
              <div
                className={[
                  "h-1 w-full bg-gradient-to-r",
                  COMPARISON_ACCENTS[index % COMPARISON_ACCENTS.length],
                ].join(" ")}
                aria-hidden="true"
              />
              <div className="p-5">
                <h3 className="mb-2 text-sm font-semibold text-foreground">
                  {comparison.title}
                </h3>
                <ul className="space-y-1.5 text-sm leading-relaxed text-foreground/55">
                  {comparison.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* ── About this page ── */}
      <p className="mx-auto mb-16 max-w-xl rounded-xl bg-foreground/5 px-5 py-4 text-center text-sm text-foreground/50 ring-1 ring-border">
        {copy.intro}
      </p>

      {/* ── Features ── */}
      <section className="mb-16">
        <h2 className="mb-5 text-xl font-semibold text-foreground">
          {copy.featuresTitle}
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {copy.features.map((feature, index) => (
            <WobbleCard
              key={feature.title}
              containerClassName={[
                "ring-1 ring-border",
                FEATURE_CARD_TONES[index % FEATURE_CARD_TONES.length],
                index === 0 ? "sm:col-span-2" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              className="px-5 py-8 sm:px-8"
            >
              <h3 className="mb-1.5 max-w-sm text-base font-semibold text-foreground sm:text-lg">
                {feature.title}
              </h3>
              <p className="max-w-sm text-sm leading-relaxed text-foreground/55">
                {feature.description}
              </p>
            </WobbleCard>
          ))}
        </div>
      </section>

      {/* ── UI customisability spotlight ── */}
      <section className="mb-16">
        <h2 className="mb-2 text-xl font-semibold text-foreground">
          {copy.uiTitle}
        </h2>
        <p className="mb-5 text-sm leading-relaxed text-foreground/55">
          {copy.uiDescription}
        </p>
        <ul className="grid gap-4 sm:grid-cols-2">
          {copy.uiSlots.map((slot, index) => (
            <li key={slot.name}>
              <CardSpotlight
                radius={220}
                color={spotlightColors[index % spotlightColors.length]}
                className="h-full border-0 bg-foreground/5 p-5"
              >
                <h3 className="relative z-20 mb-1.5 text-sm font-semibold text-foreground">
                  {slot.name}
                </h3>
                <p className="relative z-20 text-sm leading-relaxed text-foreground/55">
                  {slot.description}
                </p>
              </CardSpotlight>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Workflow demo ── */}
      <section className="mb-16">
        <h2 className="mb-2 text-xl font-semibold text-foreground">
          {copy.workflowTitle}
        </h2>
        <p className="mb-5 text-sm leading-relaxed text-foreground/55">
          {copy.workflowCaption}
        </p>
        <Terminal
          commands={WORKFLOW_COMMANDS}
          outputs={WORKFLOW_OUTPUTS}
          username="seller"
          enableSound={false}
          className="max-w-none px-0"
        />
      </section>

      {/* ── Get started ── */}
      <section>
        <h2 className="mb-5 text-xl font-semibold text-foreground">
          {copy.getStartedTitle}
        </h2>
        <ol className="space-y-3">
          {copy.getStartedSteps.map((step, index) => (
            <li key={step} className="flex gap-4 text-sm text-foreground/60">
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-cyan-500 text-xs font-semibold text-white"
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
