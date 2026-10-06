// Deploy this server-side on a host that can reach Rakuten API.
// Required env: RAKUTEN_APPLICATION_ID, RAKUTEN_ACCESS_KEY, optional RAKUTEN_AFFILIATE_ID
export async function rakutenSearch(keyword, env) {
  const url = new URL("https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701");
  url.searchParams.set("format","json");
  url.searchParams.set("applicationId",env.RAKUTEN_APPLICATION_ID);
  url.searchParams.set("accessKey",env.RAKUTEN_ACCESS_KEY);
  if (env.RAKUTEN_AFFILIATE_ID) url.searchParams.set("affiliateId",env.RAKUTEN_AFFILIATE_ID);
  url.searchParams.set("keyword",keyword);
  const res=await fetch(url);
  if(!res.ok) throw new Error("Rakuten API "+res.status);
  const data=await res.json();
  return (data.Items||data.items||[]).map(row=>{const x=row.Item||row.item||row;return {
    shop:"楽天市場",name:x.itemName||"",price:Number(x.itemPrice||0),shipping:0,total:Number(x.itemPrice||0),
    url:x.affiliateUrl||x.itemUrl||"",image:x.mediumImageUrls?.[0]?.imageUrl||x.mediumImageUrls?.[0]||"",
    shippingKnown:x.postageFlag===1
  }}).filter(x=>x.name&&x.price>0);
}
