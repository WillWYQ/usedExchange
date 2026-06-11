// Cloudflare Worker — proxies shipping rate requests to Shippo or EasyPost.
//
// Why this exists: UsedExchange is a fully static site (no server, no
// credentials in CI). Carrier rate APIs require a secret API key that must
// never reach the browser. This Worker holds that key (via `wrangler secret
// put`) and exposes a minimal, CORS-restricted endpoint the static site can
// call from ShippingEstimator. See docs/DESIGN.md §21.

export interface Env {
  SHIPPING_PROVIDER: "shippo" | "easypost";
  SHIPPO_API_KEY?: string;
  EASYPOST_API_KEY?: string;
  // siteConfig.baseUrl — only this origin may call this Worker.
  ALLOWED_ORIGIN: string;
  // siteConfig.shipping.origin — where parcels ship from.
  ORIGIN_ZIP: string;
  ORIGIN_COUNTRY: string;
}

type RateRequestBody = {
  destinationZip: string;
  destinationCountry: string;
  weight: { value: number; unit: "kg" | "lb" };
  dimensions: { length: number; width: number; height: number; unit: "cm" | "in" };
  currency: string;
};

type RateResponseBody = {
  amount: number;
  currency: string;
  carrier: string;
  service: string;
  estimatedDays: number | null;
};

type ShippoRate = {
  amount: string;
  currency: string;
  provider: string;
  servicelevel: { name: string };
  estimated_days: number | null;
};

type EasyPostRate = {
  rate: string;
  currency: string;
  carrier: string;
  service: string;
  delivery_days: number | null;
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(env.ALLOWED_ORIGIN);

    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "POST") return json({ error: "Method Not Allowed" }, 405, cors);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400, cors);
    }

    if (!isValidRequest(body)) {
      return json({ error: "Missing or invalid fields" }, 400, cors);
    }

    try {
      const rate =
        env.SHIPPING_PROVIDER === "easypost"
          ? await getEasyPostRate(body, env)
          : await getShippoRate(body, env);

      if (!rate) return json({ error: "No rates available" }, 502, cors);
      return json(rate, 200, cors);
    } catch {
      return json({ error: "Rate lookup failed" }, 502, cors);
    }
  },
};

function corsHeaders(origin: string): HeadersInit {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(data: unknown, status: number, cors: HeadersInit): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function isValidRequest(body: unknown): body is RateRequestBody {
  if (typeof body !== "object" || body === null) return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b["destinationZip"] === "string" &&
    typeof b["destinationCountry"] === "string" &&
    typeof b["weight"] === "object" &&
    b["weight"] !== null &&
    typeof b["dimensions"] === "object" &&
    b["dimensions"] !== null
  );
}

// Converts cm/in dimensions to whole inches, rounded up — both carrier APIs
// used here expect imperial units for US-origin shipments.
function toInches(d: RateRequestBody["dimensions"]) {
  const factor = d.unit === "cm" ? 1 / 2.54 : 1;
  return {
    length: Math.ceil(d.length * factor),
    width: Math.ceil(d.width * factor),
    height: Math.ceil(d.height * factor),
  };
}

// ── Shippo ───────────────────────────────────────────────────────────────
async function getShippoRate(body: RateRequestBody, env: Env): Promise<RateResponseBody | null> {
  const weightLb = body.weight.unit === "kg" ? body.weight.value * 2.20462 : body.weight.value;
  const dims = toInches(body.dimensions);

  const res = await fetch("https://api.goshippo.com/shipments/", {
    method: "POST",
    headers: {
      Authorization: `ShippoToken ${env.SHIPPO_API_KEY ?? ""}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      address_from: { zip: env.ORIGIN_ZIP, country: env.ORIGIN_COUNTRY },
      address_to: { zip: body.destinationZip, country: body.destinationCountry },
      parcels: [
        {
          length: String(dims.length),
          width: String(dims.width),
          height: String(dims.height),
          distance_unit: "in",
          weight: String(weightLb),
          mass_unit: "lb",
        },
      ],
      async: false,
    }),
  });

  if (!res.ok) return null;

  const data = (await res.json()) as { rates?: ShippoRate[] };
  const rates = data.rates ?? [];
  if (rates.length === 0) return null;

  const cheapest = rates.reduce((min, r) =>
    parseFloat(r.amount) < parseFloat(min.amount) ? r : min,
  );
  return {
    amount: Math.round(parseFloat(cheapest.amount) * 100) / 100,
    currency: cheapest.currency,
    carrier: cheapest.provider,
    service: cheapest.servicelevel.name,
    estimatedDays: cheapest.estimated_days,
  };
}

// ── EasyPost ─────────────────────────────────────────────────────────────
async function getEasyPostRate(body: RateRequestBody, env: Env): Promise<RateResponseBody | null> {
  const weightOz = body.weight.unit === "kg" ? body.weight.value * 35.274 : body.weight.value * 16;
  const dims = toInches(body.dimensions);

  const res = await fetch("https://api.easypost.com/v2/shipments", {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${env.EASYPOST_API_KEY ?? ""}:`)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      shipment: {
        from_address: { zip: env.ORIGIN_ZIP, country: env.ORIGIN_COUNTRY },
        to_address: { zip: body.destinationZip, country: body.destinationCountry },
        parcel: { length: dims.length, width: dims.width, height: dims.height, weight: weightOz },
      },
    }),
  });

  if (!res.ok) return null;

  const data = (await res.json()) as { rates?: EasyPostRate[] };
  const rates = data.rates ?? [];
  if (rates.length === 0) return null;

  const cheapest = rates.reduce((min, r) => (parseFloat(r.rate) < parseFloat(min.rate) ? r : min));
  return {
    amount: Math.round(parseFloat(cheapest.rate) * 100) / 100,
    currency: cheapest.currency,
    carrier: cheapest.carrier,
    service: cheapest.service,
    estimatedDays: cheapest.delivery_days,
  };
}
