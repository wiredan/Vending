import { formatPublicUser, jsonResponse } from '../auth/_helpers.js';

export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    if (!env?.DB) {
      return jsonResponse({ success: false, error: 'Database binding DB is missing.' }, 500);
    }

    const url = new URL(request.url);
    const idParam = String(
      url.searchParams.get('id') ||
        url.searchParams.get('uuid') ||
        request.headers.get('X-User-Id') ||
        ''
    ).trim();

    if (!idParam) {
      return jsonResponse({ success: false, error: 'User id or uuid is required.' }, 400);
    }

    const row = await env.DB
      .prepare('SELECT * FROM users WHERE id = ? OR uuid = ? LIMIT 1')
      .bind(idParam, idParam)
      .first();

    if (!row) {
      return jsonResponse({ success: false, error: 'User not found.' }, 404);
    }

    const publicUser = formatPublicUser(row);
    return jsonResponse({
      success: true,
      ...publicUser,
      user: publicUser,
    });
  } catch (err) {
    return jsonResponse({ success: false, error: err?.message || 'Failed to load user profile.' }, 500);
  }
}
