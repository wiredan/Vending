import { hashPassword, signToken, formatPublicUser, jsonResponse } from './_helpers.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    if (!env?.DB) {
      return jsonResponse({ success: false, error: 'Database binding DB is missing.' }, 500);
    }

    const body = await request.json().catch(() => ({}));
    const email = String(body?.email || '').trim().toLowerCase();
    const password = String(body?.password || '');
    const fullName = String(body?.full_name || body?.fullName || '').trim();
    const phone = String(body?.phone || '').trim();

    if (!email || !email.includes('@')) {
      return jsonResponse({ success: false, error: 'Valid email address is required.' }, 400);
    }
    if (password.length < 6) {
      return jsonResponse({ success: false, error: 'Password must be at least 6 characters.' }, 400);
    }

    const existing = await env.DB
      .prepare('SELECT id, uuid, email, password_hash FROM users WHERE lower(email) = lower(?) LIMIT 1')
      .bind(email)
      .first();

    if (existing) {
      return jsonResponse({ success: false, error: 'An account with this email already exists.' }, 409);
    }

    const userId = crypto.randomUUID();
    const passwordHash = await hashPassword(password);
    const nameParts = fullName.split(/\s+/).filter(Boolean);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    await env.DB
      .prepare(
        `INSERT INTO users (
          id, uuid, email, password_hash, full_name, first_name, last_name, phone,
          role, is_admin, kyc_verified, kyc_status, balance, dan_balance, sda_balance
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'user', 0, 0, 'unverified', 0, 0, 0)`
      )
      .bind(userId, userId, email, passwordHash, fullName, firstName, lastName, phone)
      .run();

    const created = await env.DB
      .prepare('SELECT * FROM users WHERE id = ? LIMIT 1')
      .bind(userId)
      .first();

    const publicUser = formatPublicUser(created);
    const token = await signToken({ sub: publicUser.uuid, email: publicUser.email, role: publicUser.role }, env);

    return jsonResponse({
      success: true,
      token,
      user: publicUser,
    });
  } catch (err) {
    return jsonResponse({ success: false, error: err?.message || 'Registration failed.' }, 500);
  }
}
