#!/usr/bin/env bash
# scripts/setup-ui.sh
# Run once: pnpm setup-ui
# Installs all 27 supported Aceternity UI components into components/ui/.
# Commit the resulting files so sellers never need to run this again.
# Full wiring of these components happens in Phase 11 (UI Slot Adapters).

set -e
echo "Installing all supported Aceternity UI components..."

# ── Background slot (13 components) ──────────────────────────────────────────
npx shadcn@latest add @aceternity/aurora-background
npx shadcn@latest add @aceternity/background-beams-demo
npx shadcn@latest add @aceternity/background-beams-with-collision
npx shadcn@latest add @aceternity/background-gradient-animation
npx shadcn@latest add @aceternity/background-boxes-demo
npx shadcn@latest add @aceternity/wavy-background
npx shadcn@latest add @aceternity/vortex
npx shadcn@latest add @aceternity/shooting-stars-and-stars-background-demo
npx shadcn@latest add @aceternity/meteors
npx shadcn@latest add @aceternity/grid-background-demo
npx shadcn@latest add @aceternity/background-lines
npx shadcn@latest add @aceternity/spotlight
npx shadcn@latest add @aceternity/spotlight-new

# ── Item Grid slot (3 components) ─────────────────────────────────────────────
npx shadcn@latest add @aceternity/bento-grid
npx shadcn@latest add @aceternity/layout-grid
npx shadcn@latest add @aceternity/focus-cards

# ── Gallery slot (4 components) ───────────────────────────────────────────────
npx shadcn@latest add @aceternity/apple-cards-carousel-demo
npx shadcn@latest add @aceternity/images-slider
npx shadcn@latest add @aceternity/carousel
npx shadcn@latest add @aceternity/parallax-scroll parallax-scroll-2

# ── Item Card slot (7 components) ─────────────────────────────────────────────
npx shadcn@latest add @aceternity/card-hover-effect
npx shadcn@latest add @aceternity/card-spotlight
npx shadcn@latest add @aceternity/3d-card
npx shadcn@latest add @aceternity/evervault-card
npx shadcn@latest add @aceternity/wobble-card
npx shadcn@latest add @aceternity/direction-aware-hover
npx shadcn@latest add @aceternity/glare-card

echo "Done. Commit the components/ui/ files to git."
echo "Sellers can now configure any ui.* option in content/config.ts without further setup."
