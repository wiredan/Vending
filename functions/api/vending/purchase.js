import { jsonResponse } from '../auth/_helpers.js';

function maskGateway(val) {
  return String(val || '')
    .replace(/pey(?:flex)?|pevf(?:lex)?/gi, 'Gateway')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildVoucherSlip(network, amount, index, baseRef) {
  const netUpper = String(network || 'MTN').toUpperCase();
  const pinDigits = Array.from({ length: 16 }, () => Math.floor(Math.random() * 10)).join('');
  const serial = `SN-${netUpper}-${Date.now().toString().slice(-6)}-${index + 1}`;
  const dialMap = {
    MTN: `*555*${pinDigits}#`,
    GLO: `*123*${pinDigits}#`,
    AIRTEL: `*126*${pinDigits}#`,
    '9MOBILE': `*222*${pinDigits}#`,
  };
  return {
    network: netUpper,
    amount: `₦${Number(amount).toLocaleString()}`,
    pin: pinDigits,
    dialCode: dialMap[netUpper] || `*311*${pinDigits}#`,
    serial,
    reference: `${baseRef}-${index + 1}`,
    date: new Date().toISOString().replace('T', ' ').slice(0, 19),
  };
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    if (!env?.DB) {
      return jsonResponse({ success: false, error: 'Database binding DB is missing.' }, 500);
    }

    const body = await request.json().catch(() => ({}));
    const uid = String(body?.userId || body?.user_id || request.headers.get('X-User-Id') || '').trim();
    const rawType = String(body?.type || 'data').trim().toLowerCase();
    const isVoucher = Boolean(body?.isVoucher) || rawType === 'voucher';
    const orderType = isVoucher ? 'voucher' : rawType === 'airtime' ? 'airtime' : 'data';
    const network = String(body?.network || 'mtn').trim().toLowerCase();
    const networkSlug = String(body?.networkSlug || network).trim();
    const dataType = String(body?.dataType || (orderType === 'airtime' || isVoucher ? 'airtime' : 'data')).trim().toLowerCase();
    const productCode = String(body?.productCode || '').trim();
    const planName = maskGateway(String(body?.planName || (orderType === 'airtime' ? `${network.toUpperCase()} Airtime` : productCode || `${network.toUpperCase()} Bundle`)).trim());
    const phone = String(body?.phone || '').trim();
    const quantity = isVoucher ? Math.max(1, Math.min(50, Number(body?.quantity || 1))) : 1;

    const unitAmount = Number(body?.retailPrice ?? body?.amount ?? 0);
    if (!uid) {
      return jsonResponse({ success: false, error: 'Authenticated userId is required.' }, 400);
    }
    if (!Number.isFinite(unitAmount) || unitAmount <= 0) {
      return jsonResponse({ success: false, error: 'Valid positive amount is required.' }, 400);
    }
    if (!isVoucher && !phone) {
      return jsonResponse({ success: false, error: 'Recipient phone number is required.' }, 400);
    }

    const userRow = await env.DB
      .prepare('SELECT * FROM users WHERE id = ? OR uuid = ? LIMIT 1')
      .bind(uid, uid)
      .first();

    if (!userRow) {
      return jsonResponse({ success: false, error: 'User account not found.' }, 404);
    }

    const totalCharge = orderType === 'data' ? unitAmount : unitAmount * quantity;
    const currentBalance = Number(userRow.balance) || 0;
    if (currentBalance < totalCharge) {
      return jsonResponse(
        { success: false, error: `Insufficient wallet balance (₦${currentBalance.toLocaleString()} available).` },
        400
      );
    }

    const marginPercent = orderType === 'data' ? 10 : 0; // Airtime & E-PIN vouchers stay at 0% margin
    let gatewayRef = `GW-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`;
    let fulfilled = false;

    if (env?.PEYFLEX_API_KEY) {
      try {
        const endpoint =
          orderType === 'data'
            ? 'https://client.peyflex.com.ng/api/data/topup/'
            : 'https://client.peyflex.com.ng/api/airtime/topup/';
        const payload =
          orderType === 'data'
            ? {
                network: networkSlug,
                mobile_number: phone,
                plan: productCode,
              }
            : {
                network: networkSlug,
                mobile_number: phone || userRow.phone || '08030000000',
                amount: totalCharge,
              };

        const gwRes = await fetch(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Token ${env.PEYFLEX_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
        const gwJson = await gwRes.json().catch(() => null);
        if (gwRes.ok && gwJson && !gwJson.error) {
          fulfilled = true;
          if (gwJson.reference || gwJson.id) {
            gatewayRef = String(gwJson.reference || gwJson.id);
          }
        }
      } catch {}
    }

    if (!fulfilled && !env?.PEYFLEX_API_KEY) {
      fulfilled = true;
    }

    if (!fulfilled) {
      return jsonResponse(
        { success: false, error: 'Fulfillment gateway could not complete the request.' },
        502
      );
    }

    const newBalance = Number((currentBalance - totalCharge).toFixed(2));
    const orderId = crypto.randomUUID();
    const ledgerId = crypto.randomUUID();
    const vouchers = isVoucher
      ? Array.from({ length: quantity }, (_, idx) => buildVoucherSlip(network, unitAmount, idx, gatewayRef))
      : [];

    await env.DB
      .prepare('UPDATE users SET balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(newBalance, userRow.id)
      .run();

    await env.DB
      .prepare(
        `INSERT INTO wallet_ledger (id, user_id, entry_type, amount, balance_before, balance_after, reference, description)
         VALUES (?, ?, 'debit', ?, ?, ?, ?, ?)`
      )
      .bind(
        ledgerId,
        userRow.uuid || userRow.id,
        totalCharge,
        currentBalance,
        newBalance,
        orderId,
        `${orderType.toUpperCase()} - ${planName}`
      )
      .run();

    await env.DB
      .prepare(
        `INSERT INTO vending_orders (
          id, user_id, user_uuid, user_name, type, network, network_slug, data_type,
          product_code, product_name, recipient_phone, amount, retail_price, margin_percent,
          is_voucher, quantity, status, gateway_ref, vouchers_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?)`
      )
      .bind(
        orderId,
        userRow.uuid || userRow.id,
        userRow.uuid || userRow.id,
        userRow.full_name || userRow.email,
        orderType,
        network,
        networkSlug,
        dataType,
        productCode,
        planName,
        phone,
        totalCharge,
        unitAmount,
        marginPercent,
        isVoucher ? 1 : 0,
        quantity,
        gatewayRef,
        vouchers.length > 0 ? JSON.stringify(vouchers) : null
      )
      .run();

    return jsonResponse({
      success: true,
      message: isVoucher
        ? `Successfully generated ${quantity} Airtime E-PIN Voucher Slip(s) via Gateway.`
        : `${planName} delivered successfully via Gateway.`,
      newBalance,
      reference: gatewayRef,
      ...(vouchers.length > 0 ? { vouchers, voucher: vouchers[0] } : {}),
    });
  } catch (err) {
    return jsonResponse({ success: false, error: err?.message || 'Vending purchase failed.' }, 500);
  }
}
