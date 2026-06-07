// ⚠️ DO NOT EDIT — auto-wired from content/config.ts ui.background
// To change the background, set siteConfig.ui.background in content/config.ts
"use client";

import React from "react";
import { siteConfig } from "@/content/config";
import { AuroraBackground } from "@/components/ui/aurora-background";
import { BackgroundBeams } from "@/components/ui/background-beams";
import { BackgroundBeamsWithCollision } from "@/components/ui/background-beams-with-collision";
import { BackgroundGradientAnimation } from "@/components/ui/background-gradient-animation";
import { BoxesCore } from "@/components/ui/background-boxes";
import { WavyBackground } from "@/components/ui/wavy-background";
import { Vortex } from "@/components/ui/vortex";
import { ShootingStars } from "@/components/ui/shooting-stars";
import { StarsBackground } from "@/components/ui/stars-background";
import { Meteors } from "@/components/ui/meteors";
import { BackgroundLines } from "@/components/ui/background-lines";
import { Spotlight } from "@/components/ui/spotlight";
// spotlight-new exports Spotlight under the same name; alias to avoid collision
import { Spotlight as SpotlightNew } from "@/components/ui/spotlight-new";

type Props = { children: React.ReactNode };

// Decorative-only effects are rendered as a fixed, pointer-events-none layer behind
// all page content. Wrapping effects contain children directly.

export function BackgroundEffect({ children }: Props) {
  const bg = siteConfig.ui.background;

  // ── "none" / unknown ──────────────────────────────────────────────────────
  if (!bg || bg === "none") {
    return <>{children}</>;
  }

  // ── Wrapping effects ──────────────────────────────────────────────────────
  if (bg === "aurora") {
    return (
      <AuroraBackground className="min-h-screen h-auto flex-col items-start justify-start">
        {children}
      </AuroraBackground>
    );
  }

  if (bg === "background-beams-collision") {
    return (
      <BackgroundBeamsWithCollision className="min-h-screen h-auto flex-col items-start justify-start">
        {children}
      </BackgroundBeamsWithCollision>
    );
  }

  if (bg === "background-gradient-animation") {
    return (
      <BackgroundGradientAnimation containerClassName="min-h-screen" interactive={false}>
        <div className="relative z-10 w-full">{children}</div>
      </BackgroundGradientAnimation>
    );
  }

  if (bg === "wavy") {
    return (
      <WavyBackground containerClassName="min-h-screen" className="w-full h-auto pb-0">
        {children}
      </WavyBackground>
    );
  }

  if (bg === "vortex") {
    return (
      <Vortex containerClassName="min-h-screen" className="w-full h-auto">
        {children}
      </Vortex>
    );
  }

  if (bg === "background-lines") {
    return (
      <BackgroundLines className="min-h-screen h-auto w-full">
        {children}
      </BackgroundLines>
    );
  }

  // ── Decorative-only effects (fixed overlay, -z-10) ────────────────────────
  const decorativeLayer = (() => {
    if (bg === "background-beams") {
      return <BackgroundBeams className="opacity-40" />;
    }
    if (bg === "background-boxes") {
      return (
        <div className="absolute inset-0 overflow-hidden">
          <BoxesCore />
        </div>
      );
    }
    if (bg === "meteors") {
      return <Meteors number={20} />;
    }
    if (bg === "shooting-stars") {
      return (
        <>
          <StarsBackground />
          <ShootingStars />
        </>
      );
    }
    if (bg === "spotlight") {
      return <Spotlight className="-top-40 left-0 md:-top-20 md:left-60" fill="white" />;
    }
    if (bg === "spotlight-new") {
      return <SpotlightNew />;
    }
    if (bg === "grid-and-dot") {
      // Pure CSS — no Aceternity component needed
      return (
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />
      );
    }
    return null;
  })();

  if (decorativeLayer) {
    return (
      <>
        <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
          {decorativeLayer}
        </div>
        {children}
      </>
    );
  }

  // Fallback for any unknown future value
  return <>{children}</>;
}
