import { signToken, formatPublicUser, jsonResponse } from './_helpers.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    if (!env?.DB) {
      return jsonResponse({ success: false, error: 'Database binding DB is missing.' }, 500);
    }

    const body = await request.json().catch(() => ({}));
    const credential = String(body?.credential || body?.idToken || '').trim();
    if (!credential) {
      return jsonResponse({ success: false, error: 'Google credential token is required.' }, 400);
    }

    const verifyUrl = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`;
    const googleRes = await fetch(verifyUrl);
    if (!googleRes.ok) {
      return jsonResponse({ success: false, error: 'Invalid Google token.' }, 401);
    }

    const googlePayload = await googleRes.json().catch(() => null);
    const email = String(googlePayload?.email || '').trim().toLowerCase();
    const emailVerified = googlePayload?.email_verified === true || googlePayload?.email_verified === 'true';

    if (!email || !emailVerified) {
      return jsonResponse({ success: false, error: 'Google email is not verified.' }, 401);
    }

    if (env?.GOOGLE_CLIENT_ID && googlePayload?.aud && googlePayload.aud !== env.GOOGLE_CLIENT_ID) {
      return jsonResponse({ success: false, error: 'Google token audience mismatch.' }, 401);
    }

    const googleSub = String(googlePayload?.sub || '').trim();
    const fullName = String(googlePayload?.name || '').trim();
    const firstName = String(googlePayload?.given_name || fullName.split(/\s+/)[0] || '').trim();
    const lastName = String(googlePayload?.family_name || fullName.split(/\s+/).slice(1).join(' ') || '').trim();

    let userRow = await env.DB
      .prepare('SELECT * FROM users WHERE lower(email) = lower(?) LIMIT 1')
      .bind(email)
      .first();

    if (userRow) {
      await env.DB
        .prepare(
          `UPDATE users
           SET google_sub = COALESCE(google_sub, ?),
               full_name = CASE WHEN COALESCE(full_name, '') = '' THEN ? ELSE full_name END,
               first_name = CASE WHEN COALESCE(first_name, '') = '' THEN ? ELSE first_name END,
               last_name = CASE WHEN COALESCE(last_name, '') = '' THEN ? ELSE last_name END,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`
        )
        .bind(googleSub, fullName, firstName, lastName, userRow.id)
        .run();

      userRow = await env.DB
        .prepare('SELECT * FROM users WHERE id = ? LIMIT 1')
        .bind(userRow.id)
        .first();
    } else {
      const userId = crypto.randomUUID();
      await env.DB
        .prepare(
          `INSERT INTO users (
            id, uuid, email, google_sub, full_name, first_name, last_name,
            role, is_admin, kyc_verified, kyc_status, balance, dan_balance, sda_balance
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'user', 0, 0, 'unverified', 0, 0, 0)`
        )
        .bind(userId, userId, email, googleSub, fullName, firstName, lastName)
        .run();

      userRow = await env.DB
        .prepare('SELECT * FROM users WHERE id = ? LIMIT 1')
        .bind(userId)
        .first();
    }

    const publicUser = formatPublicUser(userRow);
    const token = await signToken({ sub: publicUser.uuid, email: publicUser.email, role: publicUser.role }, env);

    return jsonResponse({
      success: true,
      token,
      user: publicUser,
    });
  } catch (err) {
    return jsonResponse({ success: false, error: err?.message || 'Google OAuth failed.' }, 500);
  }
}
