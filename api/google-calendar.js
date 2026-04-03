export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

async function getToken() {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      grant_type:    'refresh_token',
    }),
  });
  const d = await r.json();
  if (!d.access_token) throw new Error('無法取得 access token');
  return d.access_token;
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  try {
    const token = await getToken();
    const BASE = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

    // GET — 查詢預訂
    if (req.method === 'GET') {
      const now = new Date();
      const url = new URL(BASE);
      url.searchParams.set('timeMin', new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString());
      url.searchParams.set('timeMax', new Date(now.getFullYear(), now.getMonth() + 3, 0).toISOString());
      url.searchParams.set('q', '彩排室');
      url.searchParams.set('singleEvents', 'true');
      url.searchParams.set('orderBy', 'startTime');

      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();

      const bookings = (d.items || []).map(ev => ({
        id:        ev.id,
        bandName:  ev.summary.replace('【彩排室】', '').trim(),
        date:      (ev.start.dateTime || ev.start.date).slice(0, 10),
        startTime: (ev.start.dateTime || '').slice(11, 16),
        endTime:   (ev.end.dateTime   || '').slice(11, 16),
        link:      ev.htmlLink,
      }));

      return new Response(JSON.stringify({ ok: true, bookings }), { headers: CORS });
    }

    // POST — 新增預訂
    if (req.method === 'POST') {
      const b = await req.json();
      const event = {
        summary:     `【彩排室】${b.bandName}`,
        location:    'jeeplee 彩排室',
        description: `聯絡人：${b.contact || '未填'}\n費用：NT$${b.cost}（${b.hours}hr × NT$180/hr）\n客戶類型：${b.clientType}　樂團類型：${b.bandType}\n預訂狀態：${b.bookingStatus}　付款狀態：${b.payStatus}\n備註：${b.notes || '無'}`,
        start: { dateTime: `${b.date}T${b.startTime}:00`, timeZone: 'Asia/Taipei' },
        end:   { dateTime: `${b.date}T${b.endTime}:00`,   timeZone: 'Asia/Taipei' },
      };

      const r = await fetch(BASE, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      });
      const d = await r.json();

      if (d.id) return new Response(JSON.stringify({ ok: true, eventId: d.id, link: d.htmlLink }), { headers: CORS });
      return new Response(JSON.stringify({ ok: false, error: d.error?.message }), { status: 400, headers: CORS });
    }

    return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), { status: 405, headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: CORS });
  }
}
