import type { Metadata } from "next";
import Link from "next/link";
import { IconArrowLeft, IconBrandGithub } from "@tabler/icons-react";
import { siteConfig } from "@/content/config";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { ReleaseTimeline } from "@/components/intro/ReleaseTimeline";
import { fetchGitHubReleases } from "@/lib/github/releases";

export const metadata: Metadata = {
  title: `Release history — ${siteConfig.name}`,
  description:
    "A timeline of UsedExchange releases, pulled from GitHub.",
};

const RELEASE_COPY = {
  title: "Release history",
  caption: "A timeline of UsedExchange updates from GitHub.",
  viewOnGitHub: "View release on GitHub",
  empty: "Release history is temporarily unavailable.",
};

const REPO_URL = "https://github.com/WillWYQ/usedExchange/releases";

export default async function ReleasesPage() {
  const releases = await fetchGitHubReleases();

  return (
    <>
      <Breadcrumb
        items={[
          { label: "Home", href: "/" },
          { label: "Release history" },
        ]}
      />

      <div className="mx-auto max-w-3xl">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-1.5 text-sm font-medium text-foreground/60 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <IconArrowLeft size={16} stroke={2} aria-hidden="true" />
          Back to home
        </Link>

        <header className="mb-10">
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {RELEASE_COPY.title}
          </h1>
          <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-lg text-sm leading-relaxed text-foreground/60">
              {RELEASE_COPY.caption}
            </p>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-2 self-start rounded-full bg-foreground px-4 py-2 text-xs font-semibold text-background transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <IconBrandGithub size={14} stroke={2} aria-hidden="true" />
              View on GitHub
            </a>
          </div>
        </header>

        <main>
          <ReleaseTimeline releases={releases} copy={RELEASE_COPY} />
        </main>
      </div>
    </>
  );
}
