/* Yahoo! Shopping affiliate IDs supplied by the site owner. */
window.priceFinderAffiliateUrl = function (value) {
  try {
    const destination = new URL(value, 'https://2n2gzrsfdt-ai.github.io/price-finder/');
    if (destination.protocol !== 'https:' || !['shopping.yahoo.co.jp', 'store.shopping.yahoo.co.jp'].includes(destination.hostname)) return value;
    const referral = new URL('https://ck.jp.ap.valuecommerce.com/servlet/referral');
    referral.searchParams.set('sid', '3783818');
    referral.searchParams.set('pid', '892722877');
    referral.searchParams.set('vc_url', destination.href);
    return referral.href;
  } catch { return value; }
};
