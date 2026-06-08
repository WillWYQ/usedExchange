import Link from "next/link";
import { siteConfig } from "@/content/config";
import { isTemplateConfigured } from "@/lib/utils/templateStatus";
import { LocaleSwitcher } from "@/components/i18n/LocaleSwitcher";
import { SearchBarClient } from "@/components/search/SearchBarClient";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        {/* Logo / site name */}
        <Link
          href="/"
          className="shrink-0 text-lg font-semibold tracking-tight text-foreground transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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
          className="flex items-center gap-5 text-sm text-foreground/70"
          aria-label="Main navigation"
        >
          {siteConfig.search.enabled && <SearchBarClient />}

          <Link
            href="/"
            className="transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground"
          >
            Home
          </Link>
          <Link
            href="/all"
            className="transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground"
          >
            {siteConfig.i18n.strings.browseAll || "Browse All"}
          </Link>

          {/* Once configured, "/" is the catalog and the project intro lives
              at /about — link to it. While unconfigured, "/" already *is*
              the intro, so a separate link would be redundant. */}
          {isTemplateConfigured() && (
            <Link
              href="/about"
              className="transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground"
            >
              About
            </Link>
          )}

          <LocaleSwitcher />
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
