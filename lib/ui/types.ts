export type BackgroundOption =
  | "none"
  | "aurora"
  | "background-beams"
  | "background-beams-collision"
  | "background-gradient-animation"
  | "background-boxes"
  | "wavy"
  | "vortex"
  | "shooting-stars"
  | "meteors"
  | "grid-and-dot"
  | "background-lines"
  | "spotlight"
  | "spotlight-new";

export type ItemGridOption = "simple" | "bento-grid" | "layout-grid" | "focus-cards";

export type GalleryOption =
  | "simple"
  | "apple-cards-carousel"
  | "images-slider"
  | "carousel"
  | "parallax-scroll";

export type ItemCardOption =
  | "simple"
  | "card-hover-effect"
  | "card-spotlight"
  | "3d-card"
  | "evervault-card"
  | "wobble-card"
  | "direction-aware-hover"
  | "glare-card";

export type UIConfig = {
  background: BackgroundOption;
  itemGrid: ItemGridOption;
  gallery: GalleryOption;
  itemCard: ItemCardOption;
};
