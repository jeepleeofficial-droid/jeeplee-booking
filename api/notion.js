export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), { status: 405, headers: CORS });

  try {
    const b = await req.json();

    const page = {
      parent: { database_id: process.env.NOTION_DATABASE_ID },
      properties: {
        '樂團／藝人':  { title:     [{ text: { content: b.bandName } }] },
        '日期':        { date:      { start: b.date } },
        '開始時間':    { rich_text: [{ text: { content: b.startTime } }] },
        '結束時間':    { rich_text: [{ text: { content: b.endTime } }] },
        '時數':        { number: parseFloat(b.hours) },
        '費用（NT$）': { number: parseInt(b.cost) },
        '聯絡人':      { rich_text: [{ text: { content: b.contact || '' } }] },
        '預訂狀態':    { select: { name: b.bookingStatus } },
        '付款狀態':    { select: { name: b.payStatus } },
        '客戶類型':    { select: { name: b.clientType } },
        '樂團類型':    { select: { name: b.bandType } },
        '備註':        { rich_text: [{ text: { content: b.notes || '' } }] },
      },
    };

    const r = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        Authorization:    `Bearer ${process.env.NOTION_TOKEN}`,
        'Content-Type':   'application/json',
        'Notion-Version': '2022-06-28',
      },
      body: JSON.stringify(page),
    });
    const d = await r.json();

    if (d.id) return new Response(JSON.stringify({ ok: true, pageId: d.id, url: d.url }), { headers: CORS });
    return new Response(JSON.stringify({ ok: false, error: d.message }), { status: 400, headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: CORS });
  }
}
