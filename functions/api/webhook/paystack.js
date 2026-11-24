import { jsonResponse } from '../auth/_helpers.js';

const encoder = new TextEncoder();
const MAX_TIMESTAMP_SKEW_SECONDS = 300;

function toHex(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

function timingSafeEqualHex(a, b) {
  const cleanA = String(a || '').trim().toLowerCase();
  const cleanB = String(b || '').trim().toLowerCase();
  if (!cleanA || !cleanB || cleanA.length !== cleanB.length) return false;
  let diff = 0;
  for (let i = 0; i < cleanA.length; i += 1) {
    diff |= cleanA.charCodeAt(i) ^ cleanB.charCodeAt(i);
  }
  return diff === 0;
}

async function computeHmacSha512Hex(secret, messageBytes) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(String(secret)),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign']
  );
  const sigBuffer = await crypto.subtle.sign('HMAC', key, messageBytes);
  return toHex(new Uint8Array(sigBuffer));
}

function parsePaystackSignatureHeader(headerValue) {
  const parts = String(headerValue || '').split(',');
  let timestamp = null;
  const v1List = [];

  for (const rawPart of parts) {
    const part = rawPart.trim();
    if (!part) continue;
    if (part.startsWith('t=')) {
      const parsed = Number(part.slice(2));
      if (Number.isFinite(parsed)) timestamp = parsed;
    } else if (part.startsWith('v1=')) {
      const rest = part.slice(3);
      const colonIdx = rest.indexOf(':');
      if (colonIdx > 0) {
        const keyId = rest.slice(0, colonIdx).trim();
        const sig = rest.slice(colonIdx + 1).trim();
        if (sig) v1List.push({ keyId, sig });
      } else if (rest.trim()) {
        v1List.push({ keyId: '', sig: rest.trim() });
      }
    }
  }

  return { timestamp, v1List };
}

async function verifyWebhookSignature(request, rawBytes, env) {
  const secretKey = String(env?.PAYSTACK_SECRET_KEY || '').trim();
  const signingSecret = String(env?.PAYSTACK_WEBHOOK_SECRET || '').trim();

  // 1. Newer Paystack-Signature header (t=...,v1=keyId:sig)
  const paystackSigHeader = request.headers.get('Paystack-Signature') || request.headers.get('paystack-signature');
  if (paystackSigHeader) {
    const { timestamp, v1List } = parsePaystackSignatureHeader(paystackSigHeader);
    if (!timestamp || v1List.length === 0) return false;

    const nowSec = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSec - timestamp) > MAX_TIMESTAMP_SKEW_SECONDS) {
      return false;
    }

    const candidateSecrets = [signingSecret, secretKey].filter(Boolean);
    if (candidateSecrets.length === 0) return false;

    const prefixBytes = encoder.encode(`${timestamp}.`);
    const signedPayload = new Uint8Array(prefixBytes.length + rawBytes.length);
    signedPayload.set(prefixBytes, 0);
    signedPayload.set(rawBytes, prefixBytes.length);

    for (const sec of candidateSecrets) {
      const expectedHex = await computeHmacSha512Hex(sec, signedPayload);
      for (const entry of v1List) {
        if (timingSafeEqualHex(expectedHex, entry.sig)) {
          return true;
        }
      }
    }
    return false;
  }

  // 2. Standard x-paystack-signature header (HMAC-SHA512 over raw body)
  const legacySig = (request.headers.get('x-paystack-signature') || '').trim();
  if (!legacySig || !secretKey) return false;

  const expectedLegacyHex = await computeHmacSha512Hex(secretKey, rawBytes);
  return timingSafeEqualHex(expectedLegacyHex, legacySig);
}

async function findUserForCharge(db, data) {
  const customerEmail = String(data?.customer?.email || '').trim().toLowerCase();
  const receiverAccount = String(
    data?.authorization?.receiver_bank_account_number ||
      data?.metadata?.receiver_account_number ||
      data?.metadata?.account_number ||
      ''
  ).trim();

  if (receiverAccount) {
    const byAcct = await db
      .prepare('SELECT * FROM users WHERE virtual_account_number = ? LIMIT 1')
      .bind(receiverAccount)
      .first();
    if (byAcct) return byAcct;
  }

  if (customerEmail) {
    const byEmail = await db
      .prepare('SELECT * FROM users WHERE lower(email) = lower(?) LIMIT 1')
      .bind(customerEmail)
      .first();
    if (byEmail) return byEmail;
  }

  return null;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    if (!env?.DB) {
      return jsonResponse({ received: false, error: 'Database binding DB is missing.' }, 500);
    }

    // Read raw bytes BEFORE JSON parsing so signature verification is exact
    const rawBuffer = await request.arrayBuffer();
    const rawBytes = new Uint8Array(rawBuffer);

    const isValid = await verifyWebhookSignature(request, rawBytes, env);
    if (!isValid) {
      return jsonResponse({ received: false, error: 'Invalid webhook signature.' }, 401);
    }

    const rawText = new TextDecoder().decode(rawBytes);
    const eventPayload = JSON.parse(rawText || '{}');
    const eventName = String(eventPayload?.event || '').trim();
    const data = eventPayload?.data || {};

    if (eventName !== 'charge.success') {
      return jsonResponse({ received: true, ignored: true, event: eventName }, 200);
    }

    const status = String(data?.status || '').trim().toLowerCase();
    const reference = String(data?.reference || '').trim();
    const currency = String(data?.currency || 'NGN').trim().toUpperCase();
    const amountKobo = Number(data?.amount || 0);
    const amountNaira = Number((amountKobo / 100).toFixed(2));

    if (status !== 'success' || !reference || !(amountNaira > 0)) {
      return jsonResponse({ received: true, skipped: 'invalid_charge_data' }, 200);
    }

    // Idempotency guard: skip if this Paystack reference was already credited
    const existingLedger = await env.DB
      .prepare('SELECT id FROM wallet_ledger WHERE reference = ? LIMIT 1')
      .bind(reference)
      .first();

    if (existingLedger) {
      return jsonResponse({ received: true, duplicate: true, reference }, 200);
    }

    const userRow = await findUserForCharge(env.DB, data);
    if (!userRow) {
      return jsonResponse({ received: true, unmatched_user: true, reference }, 200);
    }

    const currentBalance = Number(userRow.balance) || 0;
    const nextBalance = Number((currentBalance + amountNaira).toFixed(2));
    const ledgerId = crypto.randomUUID();
    const userIdKey = userRow.uuid || userRow.id;
    const description = `Paystack ${currency} deposit (${data?.channel || 'transfer'})`;

    await env.DB
      .prepare(
        `INSERT INTO wallet_ledger (id, user_id, entry_type, amount, balance_before, balance_after, reference, description)
         VALUES (?, ?, 'credit', ?, ?, ?, ?, ?)`
      )
      .bind(ledgerId, userIdKey, amountNaira, currentBalance, nextBalance, reference, description)
      .run();

    await env.DB
      .prepare('UPDATE users SET balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(nextBalance, userRow.id)
      .run();

    return jsonResponse(
      {
        received: true,
        credited: true,
        reference,
        userId: userIdKey,
        amount: amountNaira,
        newBalance: nextBalance,
      },
      200
    );
  } catch (err) {
    return jsonResponse({ received: false, error: err?.message || 'Webhook processing error.' }, 500);
  }
}
