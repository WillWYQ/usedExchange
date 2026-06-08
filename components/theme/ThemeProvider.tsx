"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

type Props = { children: React.ReactNode };

// Class-based light/dark switching — toggles `dark` on <html> (see the
// `@custom-variant dark` rule in app/globals.css). Follows the visitor's OS
// color-scheme preference by default, until they make an explicit choice via
// ThemeToggle (persisted to localStorage by next-themes).
export function ThemeProvider({ children }: Props) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem>
      {children}
    </NextThemesProvider>
  );
}
