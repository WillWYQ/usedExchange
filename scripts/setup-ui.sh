#!/usr/bin/env bash
# scripts/setup-ui.sh
# Run once: pnpm setup-ui
# Installs all 27 supported Aceternity UI components into components/ui/.
# Commit the resulting files so sellers never need to run this again.
# Full wiring of these components happens in Phase 11 (UI Slot Adapters).

set -e
echo "Installing all supported Aceternity UI components..."

# ── Background slot (13 components) ──────────────────────────────────────────
npx shadcn@latest add @aceternity/aurora-background -y
npx shadcn@latest add @aceternity/background-beams-demo -y
npx shadcn@latest add @aceternity/background-beams-with-collision -y
npx shadcn@latest add @aceternity/background-gradient-animation -y
npx shadcn@latest add @aceternity/background-boxes-demo -y
npx shadcn@latest add @aceternity/wavy-background -y
npx shadcn@latest add @aceternity/vortex -y
npx shadcn@latest add @aceternity/shooting-stars-and-stars-background-demo -y
npx shadcn@latest add @aceternity/meteors -y
npx shadcn@latest add @aceternity/grid-background-demo -y
npx shadcn@latest add @aceternity/background-lines -y
npx shadcn@latest add @aceternity/spotlight -y
npx shadcn@latest add @aceternity/spotlight-new -y

# ── Item Grid slot (3 components) ─────────────────────────────────────────────
npx shadcn@latest add @aceternity/bento-grid -y
npx shadcn@latest add @aceternity/layout-grid -y
npx shadcn@latest add @aceternity/focus-cards -y

# ── Gallery slot (4 components) ───────────────────────────────────────────────
npx shadcn@latest add @aceternity/apple-cards-carousel-demo -y
npx shadcn@latest add @aceternity/images-slider -y
npx shadcn@latest add @aceternity/carousel -y
npx shadcn@latest add @aceternity/parallax-scroll -y

# ── Item Card slot (7 components) ─────────────────────────────────────────────
npx shadcn@latest add @aceternity/card-hover-effect -y
npx shadcn@latest add @aceternity/card-spotlight -y
npx shadcn@latest add @aceternity/3d-card -y
npx shadcn@latest add @aceternity/evervault-card -y
npx shadcn@latest add @aceternity/wobble-card -y
npx shadcn@latest add @aceternity/direction-aware-hover -y
npx shadcn@latest add @aceternity/glare-card -y

echo "Done. Commit the components/ui/ files to git."
echo "Sellers can now configure any ui.* option in content/config.ts without further setup."
