const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    const b = req.body;

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

    const notionRes = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        Authorization:    `Bearer ${process.env.NOTION_TOKEN}`,
        'Content-Type':   'application/json',
        'Notion-Version': '2022-06-28',
      },
      body: JSON.stringify(page),
    });
    const data = await notionRes.json();

    if (data.id) return res.status(200).json({ ok: true, pageId: data.id, url: data.url });
    return res.status(400).json({ ok: false, error: data.message || 'Notion 寫入失敗' });

  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
