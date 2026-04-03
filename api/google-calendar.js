const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

async function getAccessToken() {
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
  if (!data.access_token) throw new Error('無法取得 token: ' + JSON.stringify(data));
  return data.access_token;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const token = await getAccessToken();

    if (req.method === 'GET') {
      const now = new Date();
      const timeMin = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
      const timeMax = new Date(now.getFullYear(), now.getMonth() + 3, 0).toISOString();
      const url = `${CALENDAR_BASE}?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&q=%E5%BD%A9%E6%8E%92%E5%AE%A4&singleEvents=true&orderBy=startTime`;
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await r.json();
      const bookings = (data.items || []).map(ev => ({
        id: ev.id,
        bandName: (ev.summary || '').replace('【彩排室】', '').trim(),
        date: (ev.start.dateTime || ev.start.date || '').slice(0, 10),
        startTime: (ev.start.dateTime || '').slice(11, 16),
        endTime: (ev.end.dateTime || '').slice(11, 16),
        link: ev.htmlLink,
      }));
      return res.status(200).json({ ok: true, bookings });
    }

    if (req.method === 'POST') {
      const b = req.body;
      const event = {
        summary: `【彩排室】${b.bandName}`,
        location: 'jeeplee 彩排室',
        description: `聯絡人：${b.contact || '未填'}\n費用：NT$${b.cost}（${b.hours}hr × NT$180/hr）\n客戶類型：${b.clientType} 樂團類型：${b.bandType}\n預訂狀態：${b.bookingStatus} 付款狀態：${b.payStatus}\n備註：${b.notes || '無'}`,
        start: { dateTime: `${b.date}T${b.startTime}:00`, timeZone: 'Asia/Taipei' },
        end:   { dateTime: `${b.date}T${b.endTime}:00`,   timeZone: 'Asia/Taipei' },
      };
      const r = await fetch(CALENDAR_BASE, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      });
      const data = await r.json();
      if (data.id) return res.status(200).json({ ok: true, eventId: data.id, link: data.htmlLink });
      return res.status(400).json({ ok: false, error: data.error?.message || '建立失敗' });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
};
