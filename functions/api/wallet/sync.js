import { jsonResponse } from '../auth/_helpers.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    if (!env?.DB) {
      return jsonResponse({ success: false, error: 'Database binding DB is missing.' }, 500);
    }

    const body = await request.json().catch(() => ({}));
    const uid = String(body?.user_id || body?.userId || request.headers.get('X-User-Id') || '').trim();
    const email = String(body?.email || '').trim().toLowerCase();

    if (!uid && !email) {
      return jsonResponse({ success: false, error: 'userId or email is required.' }, 400);
    }

    const userRow = uid
      ? await env.DB.prepare('SELECT * FROM users WHERE id = ? OR uuid = ? LIMIT 1').bind(uid, uid).first()
      : await env.DB.prepare('SELECT * FROM users WHERE lower(email) = lower(?) LIMIT 1').bind(email).first();

    if (!userRow) {
      return jsonResponse({ success: false, error: 'User account not found.' }, 404);
    }

    let syncedNewDeposits = 0;
    let currentBalance = Number(userRow.balance) || 0;

    if (env?.PAYSTACK_SECRET_KEY && userRow.virtual_account_number) {
      try {
        const paystackRes = await fetch(
          `https://api.paystack.co/transaction?status=success&perPage=20`,
          {
            headers: {
              Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
              'Content-Type': 'application/json',
            },
          }
        );
        const paystackData = await paystackRes.json().catch(() => null);
        const txList = Array.isArray(paystackData?.data) ? paystackData.data : [];

        for (const tx of txList) {
          const txEmail = String(tx?.customer?.email || '').trim().toLowerCase();
          const txAcct = String(tx?.authorization?.receiver_bank_account_number || tx?.metadata?.receiver_account_number || '').trim();
          const matchesUser =
            (userRow.email && txEmail && txEmail === String(userRow.email).toLowerCase()) ||
            (userRow.virtual_account_number && txAcct && txAcct === String(userRow.virtual_account_number));

          if (!matchesUser) continue;

          const ref = String(tx?.reference || '').trim();
          const amountNaira = Number(tx?.amount || 0) / 100;
          if (!ref || !(amountNaira > 0)) continue;

          const existingLedger = await env.DB
            .prepare('SELECT id FROM wallet_ledger WHERE reference = ? LIMIT 1')
            .bind(ref)
            .first();

          if (!existingLedger) {
            const beforeBal = currentBalance;
            const afterBal = beforeBal + amountNaira;
            const ledgerId = crypto.randomUUID();

            await env.DB
              .prepare(
                `INSERT INTO wallet_ledger (id, user_id, entry_type, amount, balance_before, balance_after, reference, description)
                 VALUES (?, ?, 'credit', ?, ?, ?, ?, ?)`
              )
              .bind(ledgerId, userRow.uuid || userRow.id, amountNaira, beforeBal, afterBal, ref, 'Virtual account bank transfer deposit')
              .run();

            await env.DB
              .prepare('UPDATE users SET balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
              .bind(afterBal, userRow.id)
              .run();

            currentBalance = afterBal;
            syncedNewDeposits += 1;
          }
        }
      } catch {}
    }

    return jsonResponse({
      success: true,
      current_balance: currentBalance,
      synced_new_deposits: syncedNewDeposits,
    });
  } catch (err) {
    return jsonResponse({ success: false, error: err?.message || 'Wallet sync failed.' }, 500);
  }
}
