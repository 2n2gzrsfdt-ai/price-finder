const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders }
  });
}

async function rakutenSearch(keyword, env) {
  if (!env.RAKUTEN_APPLICATION_ID || !env.RAKUTEN_ACCESS_KEY) return [];
  const url = new URL("https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701");
  url.searchParams.set("format", "json");
    url.searchParams.set("applicationId", env.RAKUTEN_APPLICATION_ID);
  url.searchParams.set("accessKey", env.RAKUTEN_ACCESS_KEY);
  
  if (env.RAKUTEN_AFFILIATE_ID) url.searchParams.set("affiliateId", env.RAKUTEN_AFFILIATE_ID);
  url.searchParams.set("keyword", keyword);
    
  const res = await fetch(url, {
    headers: {
      "Referer": "https://2n2gzrsfdt-ai.github.io/price-finder/",
      "Origin": "https://2n2gzrsfdt-ai.github.io",
      "User-Agent": "PRICE-FINDER/1.0"
    }
  });
  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = body.error_description || body.error || "";
    } catch (_) {
      try { detail = (await res.text()).slice(0, 180); } catch (_) {}
    }
    throw new Error("Rakuten API error: " + res.status + (detail ? " - " + detail : ""));
  }
  const data = await res.json();

  if (data.error) throw new Error("Rakuten API error: " + (data.error_description || data.error));
  return (data.Items || data.items || []).map(row => {
    const x = row.Item || row.item || row;
    return {
      shop: "楽天市場",
      name: x.itemName || "",
      price: Number(x.itemPrice || 0),
      shipping: 0,
      total: Number(x.itemPrice || 0),
      url: x.affiliateUrl || x.itemUrl || "",
      shippingKnown: x.postageFlag === 1,
      image: x.mediumImageUrls?.[0]?.imageUrl || x.mediumImageUrls?.[0] || x.smallImageUrls?.[0]?.imageUrl || x.smallImageUrls?.[0] || ""
    };
  }).filter(x => x.name && x.price > 0);
}

async function yahooSearch(keyword, env) {
  if (!env.YAHOO_APP_ID) return [];
  const url = new URL("https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch");
  url.searchParams.set("appid", env.YAHOO_APP_ID);
  url.searchParams.set("query", keyword);
  url.searchParams.set("sort", "-score");
  url.searchParams.set("results", "50");

  const res = await fetch(url);
  if (!res.ok) throw new Error("Yahoo Shopping API error: " + res.status);
  const data = await res.json();

  return (data.hits || []).map(x => ({
    shop: "Yahoo!ショッピング",
    name: x.name || "",
    price: Number(x.price || 0),
    shipping: Number(x.shipping?.flatRate || 0),
    total: Number(x.price || 0) + Number(x.shipping?.flatRate || 0),
    url: x.url || "",
    image: x.exImage?.url || x.image?.large || x.image?.medium || x.image?.small || x.image || ""
  })).filter(x => x.name && x.price > 0);
}

function normalizeText(v) {
  return String(v || "").toLowerCase().normalize("NFKC").replace(/\s+/g, " ").trim();
}

const accessoryWords = ["ケース","カバー","ストラップ","保護フィルム","ガラスフィルム","フィルム","イヤーピース","ホルダー","収納","ポーチ","バッグ","ケーブル","充電器","アダプター","スタンド","交換用","互換","アクセサリー","シール","キャップ","スキン","バンド","ベルト","保護カバー","液晶保護","レンズ保護","ダストプラグ","ステッカー"];
const mainProductHints = ["airpods","iphone","ipad","macbook","switch","playstation","ps5","イヤホン","ヘッドホン","ノートパソコン","モニター","カメラ","テレビ"];

function relevanceScore(item, keyword) {
  const name = normalizeText(item.name);
  const q = normalizeText(keyword);
  if (!name || !q) return -999;
  const tokens = q.split(/[\s　/・_-]+/).filter(t => t.length > 1);
  let score = 0, matched = 0;
  if (name === q) score += 120;
  if (name.includes(q)) score += 55;
  for (const t of tokens) {
    if (name.includes(t)) { score += 15; matched++; }
    else score -= 9;
  }
  if (tokens.length && matched === tokens.length) score += 30;
  if (tokens.length > 1 && matched / tokens.length < .5) score -= 35;
  const likelyMainProduct = mainProductHints.some(w => q.includes(w));
  const qWantsAccessory = accessoryWords.some(w => q.includes(w));
  if (likelyMainProduct && !qWantsAccessory) {
    let accessoryHits = 0;
    for (const w of accessoryWords) if (name.includes(w) && !q.includes(w)) accessoryHits++;
    score -= accessoryHits * 65;
    if (/対応|用\b|専用/.test(name) && accessoryHits) score -= 35;
  }
  const modelTokens = q.match(/[a-z]+[- ]?\d+[a-z0-9-]*/g) || [];
  for (const model of modelTokens) if (name.includes(model.replace(/ /g,"")) || name.includes(model)) score += 35;
  if (/中古|ジャンク|訳あり/.test(name) && !/中古|ジャンク|訳あり/.test(q)) score -= 22;
  if (/レンタル|ふるさと納税/.test(name) && !/レンタル|ふるさと納税/.test(q)) score -= 35;
  return score;
}

function isObviousAccessory(item, keyword) {
  const name = normalizeText(item.name);
  const q = normalizeText(keyword);
  const likelyMainProduct = mainProductHints.some(w => q.includes(w));
  const qWantsAccessory = accessoryWords.some(w => q.includes(w));
  if (!likelyMainProduct || qWantsAccessory) return false;
  const hits = accessoryWords.filter(w => name.includes(w) && !q.includes(w)).length;
  if (!hits) return false;
  const strongAccessory = /ケース|カバー|フィルム|イヤーピース|ストラップ|ホルダー|ポーチ|ケーブル|充電器|アダプター|スタンド|交換用|アクセサリー|バンド|ベルト|ステッカー/.test(name);
  const accessoryPattern = /対応|専用|用ケース|保護|収納|交換用/.test(name);
  return hits >= 2 || (strongAccessory && accessoryPattern);
}

function rankItems(items, keyword) {
  const ranked = items.map(x => ({...x, relevance: relevanceScore(x, keyword)}))
    .sort((a,b) => b.relevance - a.relevance || a.total - b.total);
  const filtered = ranked.filter(x => !isObviousAccessory(x, keyword));
  return filtered.length >= 3 ? filtered : ranked;
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    const u = new URL(request.url);

    if (u.pathname === "/health") return json({ ok: true, service: "PRICE FINDER API", configured: { rakuten: !!env.RAKUTEN_APPLICATION_ID && !!env.RAKUTEN_ACCESS_KEY, rakutenAffiliate: !!env.RAKUTEN_AFFILIATE_ID, yahoo: !!env.YAHOO_APP_ID, yahooAffiliate: false } });
    if (u.pathname === "/debug/rakuten") {
      const configured = !!env.RAKUTEN_APPLICATION_ID && !!env.RAKUTEN_ACCESS_KEY;
      if (!configured) return json({ ok:false, configured:false, error:"Rakuten credentials are not configured" }, 503);
      try {
        const items = await rakutenSearch("AirPods", env);
        return json({ ok:true, configured:true, count:items.length, sample:items.slice(0,2).map(x=>({name:x.name,price:x.price,hasUrl:!!x.url,hasImage:!!x.image})) });
      } catch (e) {
        return json({ ok:false, configured:true, error:String(e?.message||e) }, 502);
      }
    }
    if (u.pathname !== "/api/search") return json({ error: "Not found" }, 404);

    const keyword = (u.searchParams.get("q") || "").trim();
    if (!keyword) return json({ error: "q is required" }, 400);
    if (keyword.length > 128) return json({ error: "q is too long" }, 400);

    try {
      const results = await Promise.allSettled([
        rakutenSearch(keyword, env),
        yahooSearch(keyword, env)
      ]);
      const rakuten = results[0].status === "fulfilled" ? results[0].value : [];
      const yahoo = results[1].status === "fulfilled" ? results[1].value : [];
      const errors = {
        rakuten: results[0].status === "rejected" ? String(results[0].reason?.message || results[0].reason) : null,
        yahoo: results[1].status === "rejected" ? String(results[1].reason?.message || results[1].reason) : null
      };
      const items = rankItems([...rakuten, ...yahoo], keyword);
      if (!items.length) return json({ error: "price search failed", detail: errors.rakuten || errors.yahoo || "no results", sources: { rakuten: false, yahoo: false }, errors }, 502);
      return json({
        ok: true,
        keyword,
        count: items.length,
        sources: { rakuten: rakuten.length > 0, yahoo: yahoo.length > 0 },
        errors,
        items
      });
    } catch (error) {
      return json({ error: "price search failed", detail: String(error?.message || error) }, 502);
    }
  }
};

