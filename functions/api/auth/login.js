import { verifyPassword, signToken, formatPublicUser, jsonResponse } from './_helpers.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    if (!env?.DB) {
      return jsonResponse({ success: false, error: 'Database binding DB is missing.' }, 500);
    }

    const body = await request.json().catch(() => ({}));
    const email = String(body?.email || '').trim().toLowerCase();
    const password = String(body?.password || '');

    if (!email || !password) {
      return jsonResponse({ success: false, error: 'Email and password are required.' }, 400);
    }

    const userRow = await env.DB
      .prepare('SELECT * FROM users WHERE lower(email) = lower(?) LIMIT 1')
      .bind(email)
      .first();

    if (!userRow || !userRow.password_hash) {
      return jsonResponse({ success: false, error: 'Invalid email or password.' }, 401);
    }

    const valid = await verifyPassword(password, userRow.password_hash);
    if (!valid) {
      return jsonResponse({ success: false, error: 'Invalid email or password.' }, 401);
    }

    const publicUser = formatPublicUser(userRow);
    const token = await signToken({ sub: publicUser.uuid, email: publicUser.email, role: publicUser.role }, env);

    return jsonResponse({
      success: true,
      token,
      user: publicUser,
    });
  } catch (err) {
    return jsonResponse({ success: false, error: err?.message || 'Login failed.' }, 500);
  }
}
