export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const stockNo = searchParams.get('stockNo');

  if (!stockNo) {
    return new Response(JSON.stringify({ error: 'stockNo is required' }), { status: 400 });
  }

  try {
    // TWSE 三大法人買賣超資料
    const today = new Date();
    // 取最近交易日（往前找，避開假日）
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      dates.push(`${y}${m}${day}`);
    }

    let institutionalData = null;

    // 嘗試最近幾天，找到有數據的日期
    for (const date of dates) {
      const url = `https://www.twse.com.tw/rwd/zh/fund/T86?date=${date}&selectType=ALLBUT0999&response=json`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
          'Referer': 'https://www.twse.com.tw/',
        },
      });

      if (!res.ok) continue;
      const data = await res.json();

      if (data.stat !== 'OK' || !data.data || data.data.length === 0) continue;

      // 找到對應股票代號
      const row = data.data.find(r => r[0] === stockNo);
      if (!row) continue;

      // TWSE T86 欄位說明：
      // [0] 證券代號, [1] 證券名稱
      // [2] 外資買進, [3] 外資賣出, [4] 外資買賣超
      // [5] 投信買進, [6] 投信賣出, [7] 投信買賣超
      // [8] 自營商買進(自行), [9] 自營商賣出(自行), [10] 自營商買賣超(自行)
      // [11] 自營商買進(避險), [12] 自營商賣出(避險), [13] 自營商買賣超(避險)
      // [14] 三大法人買賣超合計

      // TWSE 數據單位為股，除以 1000 換算為張
      const parseNum = (str) => Math.round((parseInt((str || '0').replace(/,/g, ''), 10) || 0) / 1000);

      institutionalData = {
        date,
        stockNo: row[0],
        stockName: row[1],
        foreign: {
          buy:  parseNum(row[2]),
          sell: parseNum(row[3]),
          net:  parseNum(row[4]),
        },
        trust: {
          buy:  parseNum(row[5]),
          sell: parseNum(row[6]),
          net:  parseNum(row[7]),
        },
        dealer: {
          buy:  parseNum(row[8]) + parseNum(row[11]),
          sell: parseNum(row[9]) + parseNum(row[12]),
          net:  parseNum(row[10]) + parseNum(row[13]),
        },
        total: parseNum(row[14]),
      };
      break;
    }

    if (!institutionalData) {
      return new Response(JSON.stringify({
        error: '查無法人數據，可能為非交易日或股票代號錯誤',
        stockNo,
      }), { status: 404 });
    }

    return new Response(JSON.stringify(institutionalData), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
