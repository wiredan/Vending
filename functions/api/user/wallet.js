import { jsonResponse } from '../auth/_helpers.js';

export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    if (!env?.DB) {
      return jsonResponse({ success: false, error: 'Database binding DB is missing.' }, 500);
    }

    const url = new URL(request.url);
    const uid = String(
      url.searchParams.get('userId') ||
        url.searchParams.get('id') ||
        request.headers.get('X-User-Id') ||
        ''
    ).trim();

    if (!uid) {
      return jsonResponse({ success: false, error: 'userId is required.' }, 400);
    }

    const row = await env.DB
      .prepare('SELECT * FROM users WHERE id = ? OR uuid = ? LIMIT 1')
      .bind(uid, uid)
      .first();

    if (!row) {
      return jsonResponse({ success: false, error: 'User wallet not found.' }, 404);
    }

    const virtualAccount = row.virtual_account_number
      ? {
          accountNumber: row.virtual_account_number,
          bankName: row.virtual_bank_name || 'Paystack-Titan',
          accountName: row.virtual_account_name || row.full_name || '',
          accountHolderName: row.virtual_account_name || row.full_name || '',
        }
      : null;

    return jsonResponse({
      success: true,
      userId: row.uuid || row.id,
      balance: Number(row.balance) || 0,
      virtualAccount,
    });
  } catch (err) {
    return jsonResponse({ success: false, error: err?.message || 'Failed to load wallet.' }, 500);
  }
}
