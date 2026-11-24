import { jsonResponse } from './auth/_helpers.js';

function extractGbFromName(name) {
  const str = String(name || '');
  const gbMatch = str.match(/(\d+(?:\.\d+)?)\s*GB/i);
  if (gbMatch) return Number(gbMatch[1]) || 0;
  const mbMatch = str.match(/(\d+(?:\.\d+)?)\s*MB/i);
  if (mbMatch) return Number(((Number(mbMatch[1]) || 0) / 1024).toFixed(3));
  return 0;
}

export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    if (!env?.DB) {
      return jsonResponse({ success: false, error: 'Database binding DB is missing.' }, 500);
    }

    const callerId = String(request.headers.get('X-User-Id') || '').trim();
    if (callerId) {
      const caller = await env.DB
        .prepare('SELECT id, uuid, email, role, is_admin FROM users WHERE id = ? OR uuid = ? LIMIT 1')
        .bind(callerId, callerId)
        .first();
      const allowed =
        caller &&
        (String(caller.email).toLowerCase() === 'mtlhumaid@gmail.com' ||
          caller.role === 'admin' ||
          Number(caller.is_admin) === 1);
      if (!allowed) {
        return jsonResponse({ success: false, error: 'Unauthorized team access.' }, 403);
      }
    }

    const usersRes = await env.DB
      .prepare('SELECT id, uuid, email, full_name, role, is_admin, balance, created_at FROM users ORDER BY created_at DESC LIMIT 200')
      .all();
    const userDirectory = Array.isArray(usersRes?.results) ? usersRes.results : [];

    const ordersRes = await env.DB
      .prepare('SELECT * FROM vending_orders ORDER BY created_at DESC LIMIT 200')
      .all();
    const orders = Array.isArray(ordersRes?.results) ? ordersRes.results : [];

    let totalRevenue = 0;
    let totalVolumeGB = 0;
    const dailyMap = new Map();
    const agentMap = new Map();

    const recentSales = orders.map((o) => {
      const amount = Number(o.amount || o.retail_price || 0);
      const gb = o.type === 'data' ? extractGbFromName(o.product_name || o.product_code) : 0;
      totalRevenue += amount;
      totalVolumeGB = Number((totalVolumeGB + gb).toFixed(2));

      const dateKey = String(o.created_at || '').slice(0, 10) || 'Today';
      const dayEntry = dailyMap.get(dateKey) || { date: dateKey, totalOrders: 0, volumeGB: 0, revenue: 0 };
      dayEntry.totalOrders += 1;
      dayEntry.volumeGB = Number((dayEntry.volumeGB + gb).toFixed(2));
      dayEntry.revenue = Number((dayEntry.revenue + amount).toFixed(2));
      dailyMap.set(dateKey, dayEntry);

      const agentKey = String(o.user_uuid || o.user_id || 'UNKNOWN');
      const agentEntry = agentMap.get(agentKey) || {
        userUuid: agentKey,
        agentId: agentKey,
        agentName: o.user_name || agentKey,
        ordersCount: 0,
        volumeGB: 0,
        revenueGenerated: 0,
      };
      agentEntry.ordersCount += 1;
      agentEntry.volumeGB = Number((agentEntry.volumeGB + gb).toFixed(2));
      agentEntry.revenueGenerated = Number((agentEntry.revenueGenerated + amount).toFixed(2));
      agentMap.set(agentKey, agentEntry);

      return {
        id: o.id,
        userUuid: agentKey,
        userId: agentKey,
        userName: o.user_name || agentKey,
        agentName: o.user_name || agentKey,
        productName: o.product_name || o.product_code,
        amount,
        price: amount,
        created_at: o.created_at,
      };
    });

    const dailyBreakdown = Array.from(dailyMap.values());
    const agentPerformance = Array.from(agentMap.values());

    return jsonResponse({
      success: true,
      summary: {
        totalRevenue,
        totalVolumeGB,
        totalOrders: orders.length,
        activeAgents: agentPerformance.length,
        totalUsers: userDirectory.length,
      },
      userDirectory,
      dailyBreakdown,
      agentPerformance,
      recentSales,
    });
  } catch (err) {
    return jsonResponse({ success: false, error: err?.message || 'Failed to load team sales.' }, 500);
  }
}
