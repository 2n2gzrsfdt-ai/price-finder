import http from 'node:http';
import worker from './worker.js';
import pg from 'pg';
const { Pool } = pg;
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
);CREATE INDEX IF NOT EXISTS price_history_query_time_idx ON price_history (query, recorded_at DESC);`).then(()=>true).catch(e=>{console.error('DB init',e.message);return false});return dbReady}
function cors(res){res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Methods','GET, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type')}
async function saveHistory(query,items){if(!(await initDb())||!items?.length)return;const best={};for(const x of items){if(!x?.shop||!x?.name||!Number(x.price))continue;const total=Number(x.total)||Number(x.price)+(Number(x.shipping)||0);if(!best[x.shop]||total<best[x.shop].total)best[x.shop]={...x,total}}for(const x of Object.values(best)){await pool.query('INSERT INTO price_history(query,shop,product_name,price,total,product_url) VALUES($1,$2,$3,$4,$5,$6)',[query,x.shop,x.name,Math.round(Number(x.price)),Math.round(x.total),x.affiliateUrl||x.url||null])}}
const server = http.createServer(async (req, res) => {
 try {
  cors(res);
  if(req.method==='OPTIONS'){res.writeHead(204);res.end();return}
  if(req.method!=='GET'){res.writeHead(405,{Allow:'GET, OPTIONS'});res.end();return}
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/')url.pathname='/health';
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
