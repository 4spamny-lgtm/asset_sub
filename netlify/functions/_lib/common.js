const TD_BASE = "https://api.twelvedata.com";
const YH_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, OPTIONS",
      "cache-control": "public, max-age=60, s-maxage=300",
    },
    body: JSON.stringify(body),
  };
}

function marketInfo(market, ticker) {
  const m = String(market || "").toUpperCase();
  const t = String(ticker || "").trim().toUpperCase();
  if (!t) throw new Error("ticker is required");
  if (m === "KR") return { market: "KR", ticker: t, currency: "KRW" };
  return { market: "US", ticker: t, currency: "USD" };
}

function ymd(d) {
  return d.toISOString().slice(0, 10);
}
function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return ymd(d);
}
function unix(dateStr) {
  return Math.floor(new Date(`${dateStr}T00:00:00Z`).getTime() / 1000);
}

async function getJson(url) {
  const r = await fetch(url, { headers: { "user-agent": "AssetView/1.0" } });
  const text = await r.text();
  let j;
  try { j = JSON.parse(text); } catch { throw new Error(`Bad JSON (${r.status})`); }
  if (!r.ok) throw new Error(j?.message || j?.error || `HTTP ${r.status}`);
  return j;
}

function yahooCandidates(info) {
  if (info.market === "KR") return [`${info.ticker}.KS`, `${info.ticker}.KQ`];
  return [info.ticker];
}

async function yahooSeries(symbol, startDate, endDate) {
  const p1 = unix(startDate);
  const p2 = unix(addDays(endDate, 1));
  const u = `${YH_BASE}/${encodeURIComponent(symbol)}?period1=${p1}&period2=${p2}&interval=1d&events=history&includeAdjustedClose=true`;
  const j = await getJson(u);
  const r = j?.chart?.result?.[0];
  if (!r) throw new Error(j?.chart?.error?.description || "No Yahoo data");
  const ts = r.timestamp || [];
  const q = r.indicators?.quote?.[0]?.close || [];
  const rows = ts
    .map((x,i)=>({date:ymd(new Date(x*1000)), rawClose:q[i]}))
    .filter(x=>x.rawClose !== null && x.rawClose !== undefined && Number.isFinite(Number(x.rawClose)) && Number(x.rawClose) > 0)
    .map(x=>({date:x.date, close:Number(x.rawClose)}));
  return { rows, currency:r.meta?.currency || null, symbol:r.meta?.symbol || symbol };
}

async function yahooPrice(info, date) {
  const candidates = yahooCandidates(info);
  let lastErr;
  for (const sym of candidates) {
    try {
      const end = date || ymd(new Date());
      const start = addDays(end, date ? -10 : -7);
      const { rows, currency, symbol } = await yahooSeries(sym, start, end);
      const eligible = date ? rows.filter(x=>x.date<=date) : rows;
      const row = eligible[eligible.length-1];
      if (!row) throw new Error("No closing price");
      return { price:row.close, asOf:row.date, currency:currency || info.currency, resolvedSymbol:symbol };
    } catch(e) { lastErr=e; }
  }
  throw lastErr || new Error("No Yahoo price");
}

async function yahooFx(date) {
  const end = date || ymd(new Date());
  const start = addDays(end, date ? -10 : -7);
  const { rows } = await yahooSeries("KRW=X", start, end);
  const eligible = date ? rows.filter(x=>x.date<=date) : rows;
  const row = eligible[eligible.length-1];
  if (!row) throw new Error("No USD/KRW rate");
  return { fx:row.close, asOf:row.date };
}

function tdParams(info) {
  const p = new URLSearchParams();
  p.set("symbol", info.ticker);
  if (info.market === "KR") p.set("mic_code", "XKRX");
  return p;
}

async function tdPrice(info, date, key) {
  if (!key) throw new Error("TWELVE_DATA_API_KEY is not set");
  if (date) {
    const p=tdParams(info);p.set("interval","1day");p.set("end_date",`${date} 23:59:59`);p.set("outputsize","7");p.set("apikey",key);
    const j=await getJson(`${TD_BASE}/time_series?${p}`);
    if (j.status === "error") throw new Error(j.message || "Twelve Data error");
    const vals=(j.values||[]).map(x=>({date:String(x.datetime).slice(0,10),close:Number(x.close)})).filter(x=>Number.isFinite(x.close)&&x.date<=date);
    vals.sort((a,b)=>a.date.localeCompare(b.date));
    const row=vals[vals.length-1];if(!row)throw new Error("No historical price");
    return {price:row.close,asOf:row.date,currency:j.meta?.currency||info.currency,resolvedSymbol:j.meta?.symbol||info.ticker};
  }
  const p=tdParams(info);p.set("interval","1day");p.set("outputsize","1");p.set("apikey",key);
  const j=await getJson(`${TD_BASE}/time_series?${p}`);
  if (j.status === "error") throw new Error(j.message || "Twelve Data error");
  const row=j.values?.[0];if(!row)throw new Error("No latest price");
  return {price:Number(row.close),asOf:String(row.datetime).slice(0,10),currency:j.meta?.currency||info.currency,resolvedSymbol:j.meta?.symbol||info.ticker};
}

async function tdFx(date,key){
  const p=new URLSearchParams({symbol:"USD/KRW",apikey:key});if(date)p.set("date",date);
  const j=await getJson(`${TD_BASE}/exchange_rate?${p}`);
  if (j.status === "error") throw new Error(j.message||"Twelve Data FX error");
  const fx=Number(j.rate);if(!Number.isFinite(fx))throw new Error("No USD/KRW rate");
  return {fx,asOf:date||null};
}

async function resolvePrice({ticker,market,date}) {
  const info=marketInfo(market,ticker);
  const provider=(process.env.PRICE_PROVIDER||"yahoo").toLowerCase();
  let quote, fx={fx:1,asOf:date||null};
  if(provider==="twelvedata"){
    quote=await tdPrice(info,date,process.env.TWELVE_DATA_API_KEY);
    if((quote.currency||info.currency).toUpperCase()!=="KRW")fx=await tdFx(date||quote.asOf,process.env.TWELVE_DATA_API_KEY);
  }else{
    quote=await yahooPrice(info,date);
    if((quote.currency||info.currency).toUpperCase()!=="KRW")fx=await yahooFx(date||quote.asOf);
  }
  const cur=(quote.currency||info.currency).toUpperCase();
  const priceKrw=cur==="KRW"?quote.price:quote.price*fx.fx;
  return {
    priceKrw:Number(priceKrw),
    price:Number(quote.price),
    fx:cur==="KRW"?1:Number(fx.fx),
    currency:cur,
    asOf:quote.asOf,
    provider,
    resolvedSymbol:quote.resolvedSymbol,
  };
}

module.exports={response,resolvePrice};
