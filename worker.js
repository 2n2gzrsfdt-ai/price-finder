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
  url.searchParams.set("formatVersion", "2");
  url.searchParams.set("applicationId", env.RAKUTEN_APPLICATION_ID);
  url.searchParams.set("accessKey", env.RAKUTEN_ACCESS_KEY);
  if (env.RAKUTEN_AFFILIATE_ID) url.searchParams.set("affiliateId", env.RAKUTEN_AFFILIATE_ID);
  url.searchParams.set("keyword", keyword);
  url.searchParams.set("sort", "-itemPrice");
  url.searchParams.set("hits", "30");

  const res = await fetch(url);
  if (!res.ok) throw new Error("Rakuten API error: " + res.status);
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
  url.searchParams.set("sort", "-price");
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

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    const u = new URL(request.url);

    if (u.pathname === "/health") return json({ ok: true, service: "PRICE FINDER API", configured: { rakuten: !!env.RAKUTEN_APPLICATION_ID && !!env.RAKUTEN_ACCESS_KEY, yahoo: !!env.YAHOO_APP_ID } });
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
      const items = [...rakuten, ...yahoo].sort((a,b) => a.total - b.total);
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
