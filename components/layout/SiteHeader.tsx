"use client";

import { useState } from "react";
import Link from "next/link";
import { IconMenu2, IconX } from "@tabler/icons-react";
import { siteConfig } from "@/content/config";
import { isTemplateConfigured } from "@/lib/utils/templateStatus";
import { LocaleSwitcher } from "@/components/i18n/LocaleSwitcher";
import { SearchBarClient } from "@/components/search/SearchBarClient";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { useT } from "@/components/i18n/useT";

export function SiteHeader() {
  const t = useT();
  const [open, setOpen] = useState(false);

  const navLinks = (
    <>
      <Link
        href="/"
        onClick={() => setOpen(false)}
        className="transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground"
      >
        {t.home}
      </Link>
      <Link
        href="/all"
        onClick={() => setOpen(false)}
        className="transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground"
      >
        {t.browseAll}
      </Link>

      {/* Once configured, "/" is the catalog and the project intro lives
          at /about — link to it. While unconfigured, "/" already *is*
          the intro, so a separate link would be redundant. */}
      {isTemplateConfigured() && (
        <Link
          href="/about"
          onClick={() => setOpen(false)}
          className="transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground"
        >
          {t.about}
        </Link>
      )}
    </>
  );

  return (
    <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        {/* Logo / site name */}
        <Link
          href="/"
          onClick={() => setOpen(false)}
          className="shrink-0 text-lg font-semibold tracking-tight text-foreground transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {siteConfig.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={siteConfig.logo} alt={siteConfig.name} className="h-8" />
          ) : (
            siteConfig.name
          )}
        </Link>

        {/* Desktop nav — collapses into the drawer below md */}
        <nav
          className="hidden items-center gap-5 text-sm text-foreground/70 md:flex"
          aria-label="Main navigation"
        >
          {siteConfig.search.enabled && <SearchBarClient />}
          {navLinks}
          <LocaleSwitcher />
          <ThemeToggle />
        </nav>

        {/* Mobile controls — theme toggle stays reachable; everything else moves to the drawer */}
        <div className="flex items-center gap-1 md:hidden">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? t.menuClose : t.menuOpen}
            aria-expanded={open}
            aria-controls="mobile-nav"
            className="flex h-12 w-12 items-center justify-center rounded-full text-foreground/70 transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {open ? (
              <IconX size={22} stroke={2} aria-hidden="true" />
            ) : (
              <IconMenu2 size={22} stroke={2} aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {open && (
        <nav
          id="mobile-nav"
          aria-label="Mobile navigation"
          className="flex flex-col gap-1 border-t border-border px-4 py-4 text-sm text-foreground/70 md:hidden"
        >
          {siteConfig.search.enabled && (
            <div className="pb-2">
              <SearchBarClient />
            </div>
          )}
          <div className="flex flex-col gap-1 [&>a]:rounded-lg [&>a]:px-3 [&>a]:py-3">
            {navLinks}
          </div>
          <div className="px-3 py-2">
            <LocaleSwitcher />
          </div>
        </nav>
      )}
    </header>
  );
}
