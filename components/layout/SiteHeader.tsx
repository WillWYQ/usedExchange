import Link from "next/link";
import { siteConfig } from "@/content/config";
import { LocaleSwitcher } from "@/components/i18n/LocaleSwitcher";
import { SearchBarClient } from "@/components/search/SearchBarClient";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-black/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        {/* Logo / site name */}
        <Link
          href="/"
          className="shrink-0 text-lg font-semibold tracking-tight text-white transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black"
        >
          {siteConfig.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={siteConfig.logo} alt={siteConfig.name} className="h-8" />
          ) : (
            siteConfig.name
          )}
        </Link>

        {/* Nav + future slots */}
        <nav
          className="flex items-center gap-5 text-sm text-white/70"
          aria-label="Main navigation"
        >
          {siteConfig.search.enabled && <SearchBarClient />}

          <Link
            href="/"
            className="transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            Home
          </Link>
          <Link
            href="/all"
            className="transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            {siteConfig.i18n.strings.browseAll || "Browse All"}
          </Link>

          <LocaleSwitcher />
        </nav>
      </div>
    </header>
  );
}
