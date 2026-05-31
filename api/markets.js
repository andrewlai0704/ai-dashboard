export const config = {
  runtime: 'edge',
};

// 六大主要指數 Yahoo Finance 代號
const INDICES = [
  { name: 'S&P 500',   ticker: '^GSPC' },
  { name: 'NASDAQ',    ticker: '^IXIC' },
  { name: '道瓊',      ticker: '^DJI' },
  { name: '台灣加權',  ticker: '^TWII' },
  { name: '日經225',   ticker: '^N225' },
  { name: '恆生',      ticker: '^HSI' },
];

async function fetchIndex(ticker) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=2d`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json',
    },
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  const meta = data.chart.result[0].meta;
  const price = meta.regularMarketPrice;
  const prev  = meta.chartPreviousClose;
  const chg   = ((price - prev) / prev) * 100;
  return { price, chg };
}

export default async function handler(req) {
  try {
    const results = await Promise.allSettled(
      INDICES.map(idx => fetchIndex(idx.ticker))
    );

    const markets = INDICES.map((idx, i) => {
      const r = results[i];
      if (r.status === 'fulfilled') {
        return {
          name:  idx.name,
          price: r.value.price,
          chg:   r.value.chg,
          live:  true,
        };
      } else {
        return {
          name:  idx.name,
          price: null,
          chg:   null,
          live:  false,
        };
      }
    });

    return new Response(JSON.stringify(markets), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
