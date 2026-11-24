import { getCatalogPackages } from './utils/peyflexCatalog.js';
import { jsonResponse } from './auth/_helpers.js';

export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    const url = new URL(request.url);
    const network = String(url.searchParams.get('network') || 'mtn').trim().toLowerCase();
    const type = String(url.searchParams.get('type') || 'all').trim().toLowerCase();

    const packages = await getCatalogPackages(network, type, env);
    return jsonResponse({
      success: true,
      network,
      type,
      packages,
    });
  } catch (err) {
    return jsonResponse({ success: false, error: err?.message || 'Failed to load packages.', packages: [] }, 500);
  }
}
