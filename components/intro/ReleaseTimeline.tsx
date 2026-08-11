"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { IconExternalLink, IconTag, IconSparkles } from "@tabler/icons-react";
import type { GitHubRelease } from "@/lib/github/releases";

export interface ReleaseTimelineCopy {
  title: string;
  caption: string;
  viewOnGitHub: string;
  empty: string;
}

interface ReleaseTimelineProps {
  releases: GitHubRelease[];
  copy: ReleaseTimelineCopy;
}

function formatReleaseDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function groupByYear(
  releases: GitHubRelease[],
): { year: string; items: GitHubRelease[] }[] {
  const groups = new Map<string, GitHubRelease[]>();

  for (const release of releases) {
    const year = new Date(release.published_at).getFullYear().toString();
    if (!groups.has(year)) {
      groups.set(year, []);
    }
    groups.get(year)!.push(release);
  }

  return Array.from(groups.entries()).map(([year, items]) => ({
    year,
    items,
  }));
}

function ReleaseCard({
  release,
  viewOnGitHub,
  featured = false,
}: {
  release: GitHubRelease;
  viewOnGitHub: string;
  featured?: boolean;
}) {
  return (
    <article
      className={[
        "relative overflow-hidden ring-1 ring-border transition-all duration-300 hover:-translate-y-0.5 hover:bg-surface/30 hover:shadow-lg hover:shadow-foreground/5",
        featured
          ? "rounded-2xl bg-surface/30 p-6 md:p-8"
          : "rounded-xl bg-surface/20 p-5 md:p-6",
      ].join(" ")}
    >
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-background">
          <IconTag size={12} stroke={2} aria-hidden="true" />
          {release.tag_name}
        </span>
        <time
          dateTime={release.published_at}
          className="text-xs font-medium uppercase tracking-wide text-foreground/50"
        >
          {formatReleaseDate(release.published_at)}
        </time>
      </div>

      <h3
        className={[
          "font-semibold leading-snug text-foreground",
          featured ? "mb-4 text-xl md:text-2xl" : "mb-3 text-lg md:text-xl",
        ].join(" ")}
      >
        {release.name}
      </h3>

      {release.body && (
        <div className="prose prose-sm max-w-none text-foreground/80 dark:prose-invert">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{release.body}</ReactMarkdown>
        </div>
      )}

      <a
        href={release.html_url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {viewOnGitHub}
        <IconExternalLink size={14} stroke={2} aria-hidden="true" />
      </a>
    </article>
  );
}

function TimelineDot({ featured = false }: { featured?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="absolute -left-12 top-5 hidden h-4 w-4 md:block"
    >
      <span className="block h-full w-full rounded-full border-2 border-background bg-accent" />
      {featured && (
        <motion.span
          className="absolute -inset-2 rounded-full border border-accent"
          animate={{ scale: [1, 1.6], opacity: [0.6, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
        />
      )}
    </span>
  );
}

export function ReleaseTimeline({ releases, copy }: ReleaseTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);

  useEffect(() => {
    if (contentRef.current) {
      setContentHeight(contentRef.current.getBoundingClientRect().height);
    }
  }, []);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start 10%", "end 50%"],
  });

  const lineHeight = useTransform(scrollYProgress, [0, 1], [0, contentHeight]);
  const lineOpacity = useTransform(scrollYProgress, [0, 0.08], [0, 1]);

  if (releases.length === 0) {
    return (
      <div className="rounded-2xl bg-surface/20 p-8 text-center ring-1 ring-border md:p-12">
        <p className="text-sm text-foreground/60">{copy.empty}</p>
      </div>
    );
  }

  const latest = releases[0]!;
  const rest = releases.slice(1);
  const grouped = groupByYear(rest);

  return (
    <div ref={containerRef} className="relative">
      {/* Static track + scroll-animated fill — spans the full timeline */}
      <div
        aria-hidden="true"
        className="absolute left-6 top-0 hidden h-full w-[2px] overflow-hidden bg-[linear-gradient(to_bottom,var(--tw-gradient-stops))] from-transparent from-[0%] via-border to-transparent to-[99%] [mask-image:linear-gradient(to_bottom,transparent_0%,black_10%,black_90%,transparent_100%)] md:block"
      >
        <motion.div
          style={{
            height: lineHeight,
            opacity: lineOpacity,
          }}
          className="absolute inset-x-0 top-0 w-[2px] rounded-full bg-gradient-to-t from-accent via-accent-soft to-transparent from-[0%] via-[10%]"
        />
      </div>

      <div ref={contentRef} className="md:pl-16">
        {/* Latest release — featured */}
        <section
          aria-labelledby="latest-release-heading"
          className="relative mb-10"
        >
          <TimelineDot featured />
          <div className="mb-4 flex items-center gap-2">
            <IconSparkles
              size={14}
              className="text-accent"
              aria-hidden="true"
            />
            <h2
              id="latest-release-heading"
              className="text-sm font-semibold uppercase tracking-wide text-foreground/50"
            >
              Latest
            </h2>
          </div>
          <div>
            <ReleaseCard
              release={latest}
              viewOnGitHub={copy.viewOnGitHub}
              featured
            />
          </div>
        </section>

        {/* Earlier releases grouped by year */}
        {grouped.length > 0 && (
          <section aria-labelledby="earlier-releases-heading">
            <h2 id="earlier-releases-heading" className="sr-only">
              Earlier releases
            </h2>

            <div className="space-y-10">
              {grouped.map(({ year, items }) => (
                <div key={year} className="relative">
                  <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-foreground/50">
                    {year}
                  </h3>
                  <div className="space-y-6">
                    {items.map((release) => (
                      <div
                        key={release.tag_name}
                        className="relative"
                      >
                        <TimelineDot />
                        <ReleaseCard
                          release={release}
                          viewOnGitHub={copy.viewOnGitHub}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
