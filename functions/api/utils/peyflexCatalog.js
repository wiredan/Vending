const memoryCatalogCache = new Map();
const CACHE_TTL_MS = 60_000;
const REQUEST_TIMEOUT_MS = 2500;

const NETWORK_SLUG_MAP = {
  mtn: ['mtn_data', 'mtn_gifting', 'mtn_share', 'mtn'],
  glo: ['glo_data', 'glo_cg', 'glo'],
  airtel: ['airtel_data', 'airtel_gifting', 'airtel_cg', 'airtel'],
  '9mobile': ['9mobile_data', '9mobile_cg', 'etisalat_data', '9mobile'],
};

const DATA_MARGIN_RATE = 0.1; // 10% data bundle profit margin; 0% airtime & voucher margin

function maskGateway(val) {
  return String(val || '')
    .replace(/pey(?:flex)?|pevf(?:lex)?/gi, 'Gateway')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchJsonWithTimeout(url, headers = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetch(url, {
      headers,
      ...(controller ? { signal: controller.signal } : {}),
    });
    if (!res.ok) return null;
    return await res.json().catch(() => null);
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function normalizePackageItem(raw, index, network, dataType, slug) {
  const basePrice = Number(
    raw?.retailPrice ?? raw?.retail_price ?? raw?.price ?? raw?.amount ?? raw?.cost ?? 0
  );
  const isData = String(dataType || 'data').toLowerCase() !== 'airtime';
  const retailPrice =
    Number.isFinite(basePrice) && basePrice > 0
      ? isData
        ? Math.ceil(basePrice * (1 + DATA_MARGIN_RATE))
        : basePrice
      : 0;

  const rawName = String(
    raw?.name || raw?.plan_name || raw?.title || raw?.plan || raw?.product_name || ''
  ).trim();
  const productCode = String(
    raw?.productCode ||
      raw?.product_code ||
      raw?.plan_code ||
      raw?.variation_code ||
      raw?.code ||
      raw?.id ||
      rawName ||
      `pkg-${index}`
  ).trim();

  return {
    id: productCode,
    productCode,
    name: maskGateway(rawName || productCode),
    network,
    networkSlug: slug,
    dataType: String(dataType || 'data').toLowerCase(),
    ...(retailPrice > 0 ? { retailPrice, price: retailPrice } : {}),
  };
}

export async function getCatalogPackages(networkParam, typeParam, env) {
  const network = String(networkParam || 'mtn').trim().toLowerCase();
  const dataType = String(typeParam || 'all').trim().toLowerCase();
  const cacheKey = `${network}::${dataType}`;

  const memHit = memoryCatalogCache.get(cacheKey);
  if (memHit && Date.now() - memHit.ts < CACHE_TTL_MS) {
    return memHit.items;
  }

  if (env?.MY_BINDING) {
    try {
      const kvRaw = await env.MY_BINDING.get(`vending_pkg_${cacheKey}`);
      if (kvRaw) {
        const parsed = JSON.parse(kvRaw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          memoryCatalogCache.set(cacheKey, { items: parsed, ts: Date.now() });
          return parsed;
        }
      }
    } catch {}
  }

  const slugs = NETWORK_SLUG_MAP[network] || [network];
  const apiKey = String(env?.PEYFLEX_API_KEY || '').trim();
  const authHeaders = apiKey
    ? { Authorization: `Token ${apiKey}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };

  let items = [];

  if (apiKey) {
    for (const slug of slugs) {
      const url = `https://client.peyflex.com.ng/api/data/plans/?network=${encodeURIComponent(slug)}`;
      const payload = await fetchJsonWithTimeout(url, authHeaders, REQUEST_TIMEOUT_MS);
      const list = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.plans)
          ? payload.plans
          : Array.isArray(payload?.data)
            ? payload.data
            : [];

      if (list.length > 0) {
        items = list
          .map((raw, idx) => normalizePackageItem(raw, idx, network, dataType === 'all' ? 'data' : dataType, slug))
          .filter((item) => {
            if (!dataType || dataType === 'all' || dataType === 'data') return true;
            const hay = `${item.name} ${item.productCode} ${item.networkSlug}`.toLowerCase();
            if (dataType === 'gifting') return hay.includes('gift') || hay.includes('data') || !hay.includes('cg');
            if (dataType === 'share') return hay.includes('share') || hay.includes('data') || !hay.includes('cg');
            if (dataType === 'cg') return hay.includes('cg') || hay.includes('corporate') || !hay.includes('gift');
            return true;
          });
        if (items.length > 0) break;
      }
    }
  }

  if (items.length > 0) {
    memoryCatalogCache.set(cacheKey, { items, ts: Date.now() });
    if (env?.MY_BINDING) {
      try {
        await env.MY_BINDING.put(`vending_pkg_${cacheKey}`, JSON.stringify(items), { expirationTtl: 120 });
      } catch {}
    }
  }

  return items;
}
