const TOKEN_URL     = 'https://oauth2.googleapis.com/token';
const CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

// ─────────────────────────────────────────────
//  Access Token 快取
//  Vercel warm instance 內共用，避免每次 request 都打 OAuth
// ─────────────────────────────────────────────
let _cachedToken  = null;
let _tokenExpiry  = 0;          // ms timestamp

async function getAccessToken(forceRefresh = false) {
  const now = Date.now();

  // 還有 5 分鐘以上效期 → 直接用快取
  if (!forceRefresh && _cachedToken && now < _tokenExpiry - 5 * 60 * 1000) {
    return _cachedToken;
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      grant_type:    'refresh_token',
    }).toString(),
  });

  const data = await res.json();

  // ── OAuth 層錯誤判斷 ──
  if (data.error) {
    _cachedToken = null;
    _tokenExpiry = 0;
    if (data.error === 'invalid_grant') {
      throw new Error('[AUTH] Refresh token 已失效，請重新授權並更新 GOOGLE_REFRESH_TOKEN');
    }
    throw new Error(`[AUTH] ${data.error}: ${data.error_description || '未知錯誤'}`);
  }

  if (!data.access_token) {
    throw new Error('[AUTH] 回傳格式異常：' + JSON.stringify(data));
  }

  // 快取，Google access token 預設 3600 秒
  _cachedToken = data.access_token;
  _tokenExpiry = now + (data.expires_in || 3600) * 1000;

  return _cachedToken;
}

// ─────────────────────────────────────────────
//  帶自動重試的 fetch
//  若 Calendar API 回 401，清快取後強制換 token 再試一次
// ─────────────────────────────────────────────
async function calendarFetch(url, options = {}) {
  const doRequest = async (token) =>
    fetch(url, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${token}`,
      },
    });

  const token = await getAccessToken();
  let r = await doRequest(token);

  if (r.status === 401) {
    // access token 剛好過期 → 強制刷新後重試
    console.warn('[google-calendar] 401，強制刷新 token 後重試');
    _cachedToken = null;
    _tokenExpiry = 0;
    const newToken = await getAccessToken(true);
    r = await doRequest(newToken);
  }

  return r;
}

// ─────────────────────────────────────────────
//  主 handler
// ─────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    // ── GET：讀取預訂 ──
    if (req.method === 'GET') {
      const now     = new Date();
      const timeMin = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
      const timeMax = new Date(now.getFullYear(), now.getMonth() + 3, 0).toISOString();
      const url     = `${CALENDAR_BASE}?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&q=%E5%BD%A9%E6%8E%92%E5%AE%A4&singleEvents=true&orderBy=startTime`;

      const r    = await calendarFetch(url);
      const data = await r.json();

      if (!r.ok) {
        console.error('[google-calendar] GET 失敗', r.status, data);
        return res.status(r.status).json({ ok: false, error: data.error?.message || 'Calendar API 錯誤' });
      }

      const bookings = (data.items || []).map(ev => ({
        id:        ev.id,
        bandName:  (ev.summary || '').replace('【彩排室】', '').trim(),
        date:      (ev.start.dateTime || ev.start.date || '').slice(0, 10),
        startTime: (ev.start.dateTime || '').slice(11, 16),
        endTime:   (ev.end.dateTime   || '').slice(11, 16),
        link:      ev.htmlLink,
      }));

      return res.status(200).json({ ok: true, bookings });
    }

    // ── POST：新增預訂 ──
    if (req.method === 'POST') {
      const b       = req.body;
      const endDate = b.endDate || b.date;

      const event = {
        summary:  `【彩排室】${b.bandName}`,
        location: 'jeeplee 彩排室',
        description: [
          `聯絡人：${b.contact || '未填'}`,
          `費用：NT$${b.cost}（${b.hours}hr × NT$180/hr）`,
          `Rider：${b.notes || '無'}`,
        ].join('\n'),
        start: { dateTime: `${b.date}T${b.startTime}:00`,    timeZone: 'Asia/Taipei' },
        end:   { dateTime: `${endDate}T${b.endTime}:00`,     timeZone: 'Asia/Taipei' },
      };

      const r    = await calendarFetch(CALENDAR_BASE, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(event),
      });
      const data = await r.json();

      if (data.id) {
        return res.status(200).json({ ok: true, eventId: data.id, link: data.htmlLink });
      }
      return res.status(400).json({ ok: false, error: data.error?.message || '建立失敗' });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });

  } catch (err) {
    console.error('[google-calendar] exception:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
