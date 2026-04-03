module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    var b = req.body;

    // 計算時數（分鐘轉小時，支援跨日）
    var startParts = b.startTime.split(':');
    var endParts   = b.endTime.split(':');
    var startMins  = parseInt(startParts[0]) * 60 + parseInt(startParts[1]);
    var endMins    = parseInt(endParts[0])   * 60 + parseInt(endParts[1]);
    // 如果結束日期是隔天，加 1440 分鐘
    var hours = b.endDate && b.endDate !== b.date
      ? (endMins + 1440 - startMins) / 60
      : (endMins - startMins) / 60;

    var page = {
      parent: { database_id: process.env.NOTION_DATABASE_ID },
      properties: {
        '樂團／藝人':  { title:     [{ text: { content: b.bandName } }] },
        '日期':        { date:      { start: b.date } },
        '開始時間':    { rich_text: [{ text: { content: b.startTime } }] },
        '結束時間':    { rich_text: [{ text: { content: b.endTime } }] },
        '時數':        { number: Math.round(hours * 10) / 10 },
        '聯絡人':      { rich_text: [{ text: { content: b.contact || '' } }] },
        '聯絡方式':    { rich_text: [{ text: { content: b.contactMethod || '' } }] },
        '預訂狀態':    { select: { name: '待確認' } },
        '付款狀態':    { select: { name: '未付款' } },
        '客戶類型':    { select: { name: '新客' } },
        '樂團類型':    { select: { name: '樂團' } },
        '備註':        { rich_text: [{ text: { content: b.notes || '' } }] },
      },
    };

    var r = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        Authorization:    'Bearer ' + process.env.NOTION_TOKEN,
        'Content-Type':   'application/json',
        'Notion-Version': '2022-06-28',
      },
      body: JSON.stringify(page),
    });
    var data = await r.json();

    if (data.id) return res.status(200).json({ ok: true, pageId: data.id, url: data.url });
    return res.status(400).json({ ok: false, error: data.message || 'Notion 寫入失敗', detail: data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
};
