export const config = { runtime: 'edge' };

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get('symbol');
  if (!symbol) return new Response(JSON.stringify({ error: 'symbol required' }), { status: 400 });

  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ error: 'FINNHUB_API_KEY not set' }), { status: 500 });

  const today = new Date();
  const from = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fromStr = from.toISOString().split('T')[0];
  const toStr = today.toISOString().split('T')[0];

  try {
    // 同時抓：最新新聞 + 分析師目標價 + 評級
    const [newsRes, targetRes, recRes] = await Promise.all([
      fetch(`https://finnhub.io/api/v1/company-news?symbol=${symbol}&from=${fromStr}&to=${toStr}&token=${apiKey}`),
      fetch(`https://finnhub.io/api/v1/stock/price-target?symbol=${symbol}&token=${apiKey}`),
      fetch(`https://finnhub.io/api/v1/stock/recommendation?symbol=${symbol}&token=${apiKey}`),
    ]);

    const newsData  = newsRes.ok  ? await newsRes.json()   : [];
    const targetData = targetRes.ok ? await targetRes.json() : {};
    const recData   = recRes.ok   ? await recRes.json()    : [];

    // 最新5則新聞
    const news = (Array.isArray(newsData) ? newsData : [])
      .slice(0, 5)
      .map(n => ({
        headline: n.headline,
        source: n.source,
        date: new Date(n.datetime * 1000).toISOString().split('T')[0],
        summary: (n.summary || '').substring(0, 150),
      }));

    // 分析師目標價
    const priceTarget = targetData && targetData.targetMean ? {
      mean:   targetData.targetMean?.toFixed(2),
      high:   targetData.targetHigh?.toFixed(2),
      low:    targetData.targetLow?.toFixed(2),
      latest: targetData.targetMedian?.toFixed(2),
    } : null;

    // 最新評級（最近一筆）
    const latestRec = Array.isArray(recData) && recData.length > 0 ? {
      buy:       recData[0].buy,
      hold:      recData[0].hold,
      sell:      recData[0].sell,
      strongBuy: recData[0].strongBuy,
      period:    recData[0].period,
    } : null;

    return new Response(JSON.stringify({ symbol, news, priceTarget, latestRec }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
