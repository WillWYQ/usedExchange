"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

type Props = { children: React.ReactNode };

// Class-based light/dark switching — toggles `dark` on <html> (see the
// `@custom-variant dark` rule in app/globals.css). Defaults to dark to match
// the site's original look, but respects the visitor's OS preference and any
// explicit choice made via ThemeToggle (persisted to localStorage by next-themes).
export function ThemeProvider({ children }: Props) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="dark" enableSystem>
      {children}
    </NextThemesProvider>
  );
}
