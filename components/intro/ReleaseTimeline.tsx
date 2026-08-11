"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { IconExternalLink } from "@tabler/icons-react";
import { Timeline } from "@/components/ui/timeline";
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

export function ReleaseTimeline({ releases, copy }: ReleaseTimelineProps) {
  if (releases.length === 0) {
    return (
      <section className="mb-16">
        <h2 className="mb-2 text-xl font-semibold text-foreground">
          {copy.title}
        </h2>
        <p className="text-sm text-foreground/55">{copy.empty}</p>
      </section>
    );
  }

  const data = releases.map((release) => ({
    title: release.tag_name,
    content: (
      <div>
        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-foreground/40">
          {formatReleaseDate(release.published_at)}
        </div>
        <h3 className="mb-3 text-lg font-semibold text-foreground">
          {release.name}
        </h3>
        {release.body && (
          <div className="prose prose-sm max-w-none dark:prose-invert">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {release.body}
            </ReactMarkdown>
          </div>
        )}
        <a
          href={release.html_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {copy.viewOnGitHub}
          <IconExternalLink size={14} stroke={2} aria-hidden="true" />
        </a>
      </div>
    ),
  }));

  return (
    <section className="mb-16">
      <Timeline data={data} title={copy.title} description={copy.caption} />
    </section>
  );
}
