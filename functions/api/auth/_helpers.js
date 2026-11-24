const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str) {
  const padded = String(str || '').replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(str.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(String(password)),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );
  return `${toBase64Url(salt)}:${toBase64Url(new Uint8Array(derivedBits))}`;
}

export async function verifyPassword(password, storedHash) {
  if (!password || !storedHash || !String(storedHash).includes(':')) return false;
  const [saltB64, hashB64] = String(storedHash).split(':');
  const salt = fromBase64Url(saltB64);
  const expected = fromBase64Url(hashB64);
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(String(password)),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );
  const actual = new Uint8Array(derivedBits);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i += 1) {
    diff |= actual[i] ^ expected[i];
  }
  return diff === 0;
}

export async function signToken(payload, env) {
  const secret = String(env?.JWT_SECRET || 'wiredan-vending-hub-secret-change-in-prod');
  const header = { alg: 'HS256', typ: 'JWT' };
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7;
  const body = { ...payload, exp };

  const encodedHeader = toBase64Url(encoder.encode(JSON.stringify(header)));
  const encodedBody = toBase64Url(encoder.encode(JSON.stringify(body)));
  const unsigned = `${encodedHeader}.${encodedBody}`;

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuffer = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(unsigned));
  const encodedSig = toBase64Url(new Uint8Array(sigBuffer));
  return `${unsigned}.${encodedSig}`;
}

export function formatPublicUser(row) {
  if (!row) return null;
  const computedDan = Number(row.dan_balance || 0);
  const premiumFlag = computedDan >= 2000 ? 1 : Number(row.is_premium || 0);
  const userRole = row.role || (Number(row.is_admin) === 1 ? 'admin' : 'user');
  const adminFlag = Number(row.is_admin ?? (userRole === 'admin' ? 1 : 0));
  const resolvedWallet = row.wallet_address || row.sidra_wallet || row.sidra_wallet_address || '';

  return {
    id: row.id,
    uuid: row.uuid || row.id,
    email: row.email,
    full_name: row.full_name || '',
    first_name: row.first_name || '',
    last_name: row.last_name || '',
    phone: row.phone || '',
    role: userRole,
    is_admin: adminFlag,
    kyc_verified: Number(row.kyc_verified) || 0,
    kyc_status: row.kyc_status || 'unverified',
    balance: Number(row.balance) || 0,
    dan_balance: computedDan,
    sda_balance: Number(row.sda_balance) || 0,
    is_premium: premiumFlag,
    can_trade_high_value: premiumFlag,
    wallet_address: resolvedWallet,
    sidra_wallet: resolvedWallet,
    sidra_wallet_address: resolvedWallet,
    virtualAccount: row.virtual_account_number
      ? {
          accountNumber: row.virtual_account_number,
          bankName: row.virtual_bank_name || 'Paystack-Titan',
          accountName: row.virtual_account_name || row.full_name || '',
        }
      : null,
  };
}

export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
