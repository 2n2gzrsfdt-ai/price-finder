import http from 'node:http';
import worker from './worker.js';
import pg from 'pg';
import webpush from 'web-push';
const { Pool } = pg;
if(process.env.VAPID_PUBLIC_KEY&&process.env.VAPID_PRIVATE_KEY)webpush.setVapidDetails('https://2n2gzrsfdt-ai.github.io/price-finder/',process.env.VAPID_PUBLIC_KEY,process.env.VAPID_PRIVATE_KEY);
const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL }) : null;
let dbReady;
async function initDb(){if(!pool)return false;if(!dbReady)dbReady=pool.query(`CREATE TABLE IF NOT EXISTS price_history (
 id BIGSERIAL PRIMARY KEY,
 query TEXT NOT NULL,
 shop TEXT NOT NULL,
 product_name TEXT NOT NULL,
 price INTEGER NOT NULL,
 total INTEGER NOT NULL,
 product_url TEXT,
 recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);CREATE INDEX IF NOT EXISTS price_history_query_time_idx ON price_history (query, recorded_at DESC);
CREATE TABLE IF NOT EXISTS analytics_events (id BIGSERIAL PRIMARY KEY,event_type TEXT NOT NULL,query TEXT,shop TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());CREATE INDEX IF NOT EXISTS analytics_events_type_time_idx ON analytics_events (event_type,created_at DESC);
CREATE TABLE IF NOT EXISTS price_watches (id BIGSERIAL PRIMARY KEY, watch_key TEXT UNIQUE NOT NULL, query TEXT NOT NULL, target_price INTEGER NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), last_price INTEGER, reached BOOLEAN NOT NULL DEFAULT FALSE, last_checked_at TIMESTAMPTZ, push_subscription JSONB); ALTER TABLE price_watches ADD COLUMN IF NOT EXISTS last_price INTEGER; ALTER TABLE price_watches ADD COLUMN IF NOT EXISTS reached BOOLEAN NOT NULL DEFAULT FALSE; ALTER TABLE price_watches ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ; ALTER TABLE price_watches ADD COLUMN IF NOT EXISTS push_subscription JSONB;`).then(()=>true).catch(e=>{console.error('DB init',e.message);return false});return dbReady}
function cors(res){res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Methods','GET, POST, DELETE, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization')}
async function saveHistory(query,items){if(!(await initDb())||!items?.length)return;const best={};for(const x of items){if(!x?.shop||!x?.name||!Number(x.price))continue;const total=Number(x.total)||Number(x.price)+(Number(x.shipping)||0);if(!best[x.shop]||total<best[x.shop].total)best[x.shop]={...x,total}}for(const x of Object.values(best)){const price=Math.round(Number(x.price)),total=Math.round(x.total);const recent=await pool.query(`SELECT total FROM price_history WHERE lower(query)=lower($1) AND shop=$2 ORDER BY recorded_at DESC LIMIT 1`,[query,x.shop]);const same=recent.rows[0]&&Number(recent.rows[0].total)===total;if(same){const age=await pool.query(`SELECT recorded_at > NOW()-INTERVAL '6 hours' AS fresh FROM price_history WHERE lower(query)=lower($1) AND shop=$2 ORDER BY recorded_at DESC LIMIT 1`,[query,x.shop]);if(age.rows[0]?.fresh)continue}await pool.query('INSERT INTO price_history(query,shop,product_name,price,total,product_url) VALUES($1,$2,$3,$4,$5,$6)',[query,x.shop,x.name,price,total,x.affiliateUrl||x.url||null])}}
async function sendWatchPush(watch,best){if(!watch.push_subscription||!process.env.VAPID_PUBLIC_KEY||!process.env.VAPID_PRIVATE_KEY)return;try{await webpush.sendNotification(watch.push_subscription,JSON.stringify({title:'PRICE FINDER 値下がり',body:watch.query+' が '+Math.round(best.currentTotal).toLocaleString('ja-JP')+'円になりました。',url:best.affiliateUrl||best.url||'https://2n2gzrsfdt-ai.github.io/price-finder/',tag:'watch-'+watch.id}))}catch(e){console.error('Push send',e.statusCode||e.message);if(e.statusCode===404||e.statusCode===410)await pool.query('UPDATE price_watches SET push_subscription=NULL WHERE id=$1',[watch.id])}}
async function checkOneWatch(watch){
 const searchUrl=new URL('/api/search','http://localhost');searchUrl.searchParams.set('q',watch.query);
 const response=await worker.fetch(new Request(searchUrl,{method:'GET'}),{...process.env});
 const data=await response.json().catch(()=>({})),items=Array.isArray(data.items)?data.items:[];
 if(!response.ok||!items.length)return {ok:false,query:watch.query};
 await saveHistory(watch.query,items).catch(()=>{});
 const valid=items.map(x=>({...x,currentTotal:Number(x.total)||Number(x.price)+(Number(x.shipping)||0)})).filter(x=>Number.isFinite(x.currentTotal)&&x.currentTotal>0).sort((a,b)=>a.currentTotal-b.currentTotal);
 const best=valid[0];if(!best)return {ok:false,query:watch.query};
 const target=Number(watch.target_price),reached=best.currentTotal<=target,wasReached=!!watch.reached;
 await pool.query('UPDATE price_watches SET last_price=$1,reached=$2,last_checked_at=NOW() WHERE id=$3',[Math.round(best.currentTotal),reached,watch.id]);
 if(reached&&!wasReached)await sendWatchPush(watch,best);return {ok:true,query:watch.query,targetPrice:target,currentPrice:best.currentTotal,reached,shop:best.shop||null};
}
async function checkAllWatches(){if(!(await initDb()))return [];const r=await pool.query('SELECT id,query,target_price,reached,push_subscription FROM price_watches ORDER BY id ASC LIMIT 100');const out=[];for(const w of r.rows){try{out.push(await checkOneWatch(w))}catch(e){out.push({ok:false,query:w.query})}}return out}
const server = http.createServer(async (req, res) => {
 try {
  cors(res);
  if(req.method==='OPTIONS'){res.writeHead(204);res.end();return}
  if(!['GET','POST','DELETE'].includes(req.method)){res.writeHead(405,{Allow:'GET, POST, DELETE, OPTIONS'});res.end();return}
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/')url.pathname='/health';
  if(url.pathname==='/api/analytics/event'&&req.method==='POST'){
   if(!(await initDb())){res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:false}));return}
   let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>4000)break}let body={};try{body=JSON.parse(raw||'{}')}catch{}
   const type=String(body.type||'').trim(),q=String(body.query||'').trim().slice(0,200),shop=String(body.shop||'').trim().slice(0,80);
   if(!['page_view','search','shop_click','product_page_view','product_compare_click','product_shop_click'].includes(type)){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:false}));return}
   await pool.query('INSERT INTO analytics_events(event_type,query,shop) VALUES($1,$2,$3)',[type,q||null,shop||null]);
   res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true}));return
  }
  if(url.pathname==='/api/analytics/summary'){
   if(!(await initDb())){res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:false}));return}
   const r=await pool.query(`SELECT event_type,COUNT(*)::int AS count FROM analytics_events WHERE created_at>=NOW()-INTERVAL '30 days' GROUP BY event_type`);
   const top=await pool.query(`SELECT query,COUNT(*)::int AS count FROM analytics_events WHERE event_type='search' AND query IS NOT NULL AND created_at>=NOW()-INTERVAL '30 days' GROUP BY query ORDER BY count DESC LIMIT 10`);
   const shops=await pool.query(`SELECT shop,COUNT(*)::int AS count FROM analytics_events WHERE event_type='shop_click' AND shop IS NOT NULL AND created_at>=NOW()-INTERVAL '30 days' GROUP BY shop ORDER BY count DESC`);
   const products=await pool.query(`SELECT query,
    COUNT(*) FILTER (WHERE event_type='product_page_view')::int AS views,
    COUNT(*) FILTER (WHERE event_type='product_compare_click')::int AS comparisons,
    COUNT(*) FILTER (WHERE event_type='product_shop_click')::int AS clicks
    FROM analytics_events WHERE event_type IN ('product_page_view','product_compare_click','product_shop_click')
    AND query IS NOT NULL AND created_at>=NOW()-INTERVAL '30 days'
    GROUP BY query ORDER BY clicks DESC,views DESC,query LIMIT 20`);
   res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true,periodDays:30,productPages:products.rows,counts:Object.fromEntries(r.rows.map(x=>[x.event_type,x.count])),topSearches:top.rows,shopClicks:shops.rows}));return
  }
  if(url.pathname==='/api/watch'){
   if(!(await initDb())){res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:false,error:'database unavailable'}));return}
   if(req.method==='POST'){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>10000)break}let body={};try{body=JSON.parse(raw||'{}')}catch{}const q=String(body.query||'').trim(),target=Math.round(Number(body.targetPrice)),key=String(body.watchKey||'').trim();if(!q||!key||!Number.isFinite(target)||target<=0){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:false,error:'invalid watch'}));return}await pool.query('INSERT INTO price_watches(watch_key,query,target_price) VALUES($1,$2,$3) ON CONFLICT(watch_key) DO UPDATE SET query=EXCLUDED.query,target_price=EXCLUDED.target_price',[key,q,target]);res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true,query:q,targetPrice:target}));return}
   const key=(url.searchParams.get('key')||'').trim();if(!key){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:false,error:'key is required'}));return}if(req.method==='DELETE'){await pool.query('DELETE FROM price_watches WHERE watch_key=$1',[key]);res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true}));return}const r=await pool.query('SELECT query,target_price AS "targetPrice",created_at AS "createdAt" FROM price_watches WHERE watch_key=$1',[key]);res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true,watch:r.rows[0]||null}));return
  }
  if(url.pathname==='/api/push/public-key'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true,publicKey:process.env.VAPID_PUBLIC_KEY||null}));return}
  if(url.pathname==='/api/push/subscribe'&&req.method==='POST'){if(!(await initDb())){res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:false}));return}let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>16000){res.writeHead(413,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:false,error:'payload too large'}));return}}let body={};try{body=JSON.parse(raw)}catch{}const key=String(body.watchKey||'').trim();if(!key||!body.subscription){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:false,error:'invalid subscription'}));return}const ur=await pool.query('UPDATE price_watches SET push_subscription=$1,reached=FALSE WHERE watch_key=$2 RETURNING id',[JSON.stringify(body.subscription),key]);if(!ur.rowCount){res.writeHead(404,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:false,error:'watch not found'}));return}res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true}));return}
  if(url.pathname==='/api/watch/check-all'){
   const auth=req.headers.authorization||'';
   if(!process.env.CRON_SECRET||auth!==`Bearer ${process.env.CRON_SECRET}`){res.writeHead(401,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:false,error:'unauthorized'}));return}
   const results=await checkAllWatches();res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true,checked:results.length,reached:results.filter(x=>x.reached).length,results}));return
  }
  if(url.pathname==='/api/watch/check'){
   const key=(url.searchParams.get('key')||'').trim();
   if(!key){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:false,error:'key is required'}));return}
   if(!(await initDb())){res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:false,error:'database unavailable'}));return}
   const wr=await pool.query('SELECT id,query,target_price,reached,push_subscription FROM price_watches WHERE watch_key=$1',[key]);
   if(!wr.rows[0]){res.writeHead(404,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:false,error:'watch not found'}));return}
   const result=await checkOneWatch(wr.rows[0]);
   if(!result.ok){res.writeHead(502,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:false,error:'price lookup failed'}));return}
   res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({...result,checkedAt:new Date().toISOString()}));return
  }
  if(url.pathname==='/api/history'){
   const q=(url.searchParams.get('q')||'').trim();
   if(!q){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:false,error:'q is required'}));return}
   if(!(await initDb())){res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:false,error:'history database unavailable'}));return}
   const r=await pool.query(`SELECT shop, product_name AS name, price, total, product_url AS url, recorded_at
    FROM price_history WHERE lower(query)=lower($1) ORDER BY recorded_at ASC LIMIT 180`,[q]);
   res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true,query:q,count:r.rows.length,items:r.rows}));return
  }
  const env={...process.env};
  if(url.pathname==='/api/rakuten'){url.pathname='/api/search';delete env.YAHOO_APP_ID}
  const response=await worker.fetch(new Request(url,{method:req.method}),env);
  const body=Buffer.from(await response.arrayBuffer());
  if(response.ok&&url.pathname==='/api/search'){
   try{const data=JSON.parse(body.toString());const q=(url.searchParams.get('q')||'').trim();if(q&&Array.isArray(data.items))saveHistory(q,data.items).catch(e=>console.error('History save',e.message))}catch{}
  }
  const headers=Object.fromEntries(response.headers);headers['Access-Control-Allow-Origin']='*';
  res.writeHead(response.status,headers);res.end(body);
 } catch(e){console.error(e);res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:false,error:'Internal server error'}))}
});
server.listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log('PRICE FINDER API listening'));
process.on('SIGTERM',()=>server.close(()=>pool?.end().finally(()=>process.exit(0))));
