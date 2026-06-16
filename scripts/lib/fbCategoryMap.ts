// scripts/lib/fbCategoryMap.ts
// Maps an Item to a Facebook Marketplace category string using keyword rules.
//
// FB category format: "Top Level//Sub Level//Leaf Level"
// Rules are evaluated in order; first match wins.
// Add or reorder rules here to tune accuracy for your inventory.

import type { Item } from "@/lib/content/types";

type Rule = [pattern: RegExp, category: string];

const RULES: Rule[] = [
  // ── Computer Components ───────────────────────────────────────────────────
  [
    /\b(gpu|rtx|gtx|radeon|rx\s?\d{3,4}|graphics.?card|video.?card)\b/i,
    "Electronics//Computer Components//Graphics Cards & Video Cards",
  ],
  [
    /\b(cpu|processor|ryzen|intel.?core|i[3579]-\d{4,5})\b/i,
    "Electronics//Computer Components//CPUs & Processors",
  ],
  [
    /\b(ram|ddr[45]|memory.?stick|dimm|so-dimm)\b/i,
    "Electronics//Computer Components//RAM",
  ],
  [
    /\b(ssd|hdd|hard.?drive|nvme|m\.?2 (drive|ssd)|storage)\b/i,
    "Electronics//Computer Components//Hard Drives & Storage",
  ],
  [/\b(motherboard|mobo)\b/i, "Electronics//Computer Components//Motherboards"],
  [
    /\b(psu|power.?supply)\b/i,
    "Electronics//Computer Components//Computer Cases, Fans & Cooling",
  ],

  // ── Computers & Accessories ───────────────────────────────────────────────
  [
    /\b(laptop|macbook|thinkpad|notebook)\b/i,
    "Electronics//Computers & Accessories//Laptops",
  ],
  [
    /\b(desktop|pc.?tower|mini.?pc)\b/i,
    "Electronics//Computers & Accessories//Desktops",
  ],
  [
    /\b(keyboard|mechanical.?keyboard|keycap)\b/i,
    "Electronics//Computers & Accessories//Keyboards & Mice",
  ],
  [
    /\b(mouse|trackpad|trackball)\b/i,
    "Electronics//Computers & Accessories//Keyboards & Mice",
  ],
  [
    /\b(webcam|web.?cam)\b/i,
    "Electronics//Computers & Accessories//Webcams",
  ],
  [
    /\b(usb.?hub|docking.?station|usb.?c.?hub|thunderbolt.?dock)\b/i,
    "Electronics//Computers & Accessories//USB Hubs",
  ],
  [
    /\b(external.?drive|portable.?drive|flash.?drive|usb.?drive|thumb.?drive)\b/i,
    "Electronics//Computers & Accessories//External Hard Drives & Flash Drives",
  ],
  [
    /\b(ipad|android.?tablet|tablet|kindle.?fire)\b/i,
    "Electronics//Computers & Accessories//Tablets",
  ],

  // ── Monitors & TV ─────────────────────────────────────────────────────────
  [
    /\b(monitor|display|4k.?screen|ultrawide|curved.?screen)\b/i,
    "Electronics//TV & Video//Computer Monitors",
  ],
  [/\b(tv|television|smart.?tv|oled|qled)\b/i, "Electronics//TV & Video//TVs"],
  [/\b(projector)\b/i, "Electronics//TV & Video//Projectors"],

  // ── Audio ─────────────────────────────────────────────────────────────────
  [
    /\b(headphone|headset|earphone|earbud|airpod|iem|over-ear|in-ear)\b/i,
    "Electronics//TV & Video//Home Audio//Headphones",
  ],
  [
    /\b(speaker|soundbar|subwoofer|bluetooth.?speaker)\b/i,
    "Electronics//TV & Video//Home Audio//Speakers",
  ],
  [
    /\b(microphone|mic|audio.?interface|dac|amplifier|amp)\b/i,
    "Electronics//TV & Video//Home Audio",
  ],

  // ── Cell Phones ───────────────────────────────────────────────────────────
  [
    /\b(iphone|android.?phone|smartphone|pixel\s?\d|samsung.?galaxy|oneplus|galaxy.?s\d)\b/i,
    "Electronics//Cell Phones//Cell Phones & Smartphones",
  ],
  [
    /\b(phone.?case|iphone.?case|screen.?protector|phone.?charger)\b/i,
    "Electronics//Cell Phones//Cell Phone Accessories",
  ],

  // ── Gaming ────────────────────────────────────────────────────────────────
  [
    /\b(ps5|ps4|playstation|xbox|nintendo.?switch|gaming.?console)\b/i,
    "Electronics//Video Games//Video Games & Consoles",
  ],
  [
    /\b(game.?controller|gamepad|joystick|game.?pad)\b/i,
    "Electronics//Video Games//Video Game Accessories",
  ],
  [/\b(gaming.?chair)\b/i, "Home & Garden//Furniture//Chairs"],

  // ── Cameras ───────────────────────────────────────────────────────────────
  [
    /\b(camera|dslr|mirrorless|camera.?lens|gopro|action.?cam)\b/i,
    "Electronics//Cameras & Photo//Digital Cameras",
  ],

  // ── Books ─────────────────────────────────────────────────────────────────
  [
    /\b(textbook|isbn|algorithms|calculus|chemistry|biology|physics|engineering.?book)\b/i,
    "Books, Movies & Music//Books//Textbooks",
  ],
  [
    /\b(novel|fiction|nonfiction|hardcover|paperback|manga)\b/i,
    "Books, Movies & Music//Books",
  ],

  // ── Furniture ─────────────────────────────────────────────────────────────
  [
    /\b(standing.?desk|office.?desk|computer.?desk)\b/i,
    "Home & Garden//Furniture//Desks & Computer Tables",
  ],
  [
    /\b(office.?chair|ergonomic.?chair|desk.?chair)\b/i,
    "Home & Garden//Furniture//Chairs",
  ],
  [
    /\b(sofa|couch|loveseat|sectional)\b/i,
    "Home & Garden//Furniture//Sofas & Sectionals",
  ],
  [
    /\b(bed.?frame|bed frame|mattress|bedframe)\b/i,
    "Home & Garden//Furniture//Bedroom Furniture",
  ],
  [
    /\b(bookshelf|bookcase|shelving|shelf unit)\b/i,
    "Home & Garden//Furniture//Bookcases & Shelving",
  ],
  [/\b(dresser|wardrobe|closet)\b/i, "Home & Garden//Furniture//Bedroom Furniture"],
  [/\b(dining.?table|coffee.?table|side.?table)\b/i, "Home & Garden//Furniture//Tables"],

  // ── Kitchen ───────────────────────────────────────────────────────────────
  [
    /\b(coffee.?maker|espresso.?machine|kettle|blender|air.?fryer|microwave|toaster|instant.?pot)\b/i,
    "Home & Garden//Kitchen & Dining//Small Kitchen Appliances",
  ],
  [
    /\b(pot|pan|cookware|skillet|knife.?set|cutting.?board|dutch.?oven)\b/i,
    "Home & Garden//Kitchen & Dining//Cookware & Bakeware",
  ],

  // ── Lighting & Decor ─────────────────────────────────────────────────────
  [
    /\b(floor.?lamp|desk.?lamp|table.?lamp|led.?lamp|lamp)\b/i,
    "Home & Garden//Lamps & Lighting",
  ],

  // ── Appliances ────────────────────────────────────────────────────────────
  [/\b(vacuum|robot.?vacuum|dyson|roomba)\b/i, "Home & Garden//Appliances//Vacuums"],
  [
    /\b(washer|dryer|washing.?machine)\b/i,
    "Home & Garden//Appliances//Washers & Dryers",
  ],

  // ── Sporting Goods ────────────────────────────────────────────────────────
  [
    /\b(bike|bicycle|road.?bike|mountain.?bike|e-?bike)\b/i,
    "Sporting Goods//Cycling//Bikes",
  ],
  [
    /\b(dumbbell|barbell|weight.?plate|gym.?equipment|resistance.?band)\b/i,
    "Sporting Goods//Exercise & Fitness//Free Weights",
  ],
  [/\b(yoga.?mat|exercise.?mat)\b/i, "Sporting Goods//Exercise & Fitness//Yoga"],
  [/\b(treadmill|elliptical|rowing.?machine)\b/i, "Sporting Goods//Exercise & Fitness"],
  [
    /\b(skateboard|longboard|scooter)\b/i,
    "Sporting Goods//Outdoor Recreation//Skateboards",
  ],

  // ── Clothing & Accessories ────────────────────────────────────────────────
  [
    /\b(t-?shirt|hoodie|jacket|coat|jeans|pants|dress|skirt|sweater|jersey)\b/i,
    "Clothing, Shoes & Accessories",
  ],
  [
    /\b(sneaker|shoe|boot|sandal|trainer)\b/i,
    "Clothing, Shoes & Accessories//Shoes",
  ],
  [
    /\b(handbag|backpack|bag|wallet|purse)\b/i,
    "Clothing, Shoes & Accessories//Bags & Luggage",
  ],
  [/\b(watch|smartwatch|apple.?watch)\b/i, "Clothing, Shoes & Accessories//Jewelry & Watches"],
];

// Slug-level fallbacks — used only when no keyword rule matches.
const SLUG_FALLBACKS: Record<string, string> = {
  electronics: "Electronics",
  houseware: "Home & Garden",
  furniture: "Home & Garden//Furniture",
  clothing: "Clothing, Shoes & Accessories",
  books: "Books, Movies & Music//Books",
  sports: "Sporting Goods",
  gaming: "Electronics//Video Games",
  phones: "Electronics//Cell Phones",
  cameras: "Electronics//Cameras & Photo",
  kitchen: "Home & Garden//Kitchen & Dining",
  appliances: "Home & Garden//Appliances",
};

/**
 * Returns the best-matching Facebook Marketplace category string for an item.
 * Returns "" when nothing matches (FB will prompt the seller to choose manually).
 */
export function mapToFBCategory(item: Item): string {
  // Build a single corpus string from all descriptive fields + tags
  const corpus = [
    item.name,
    item.description,
    item.brand,
    item.model,
    item.categorySlug,
    item.categoryOverride,
    ...item.tags,
  ]
    .filter(Boolean)
    .join(" ");

  for (const [pattern, category] of RULES) {
    if (pattern.test(corpus)) return category;
  }

  return SLUG_FALLBACKS[item.categorySlug] ?? "";
}
