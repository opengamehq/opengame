import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, limits } from './harness.mjs';
const plain = value => JSON.parse(JSON.stringify(value));
const manifest = { leaderboards: [{ key:'points',order:'desc',min:0,max:100 },{key:'time',order:'asc',min:1,max:100}] };
const row = { player_name:'orbit',score:42,meta:{mode:'hard'},created_at:'2026-10-05T00:00:00Z',rank:2,is_me:true };
const page = (entries=[row],preview=false) => ({board:'points',direction:'desc',source:'game_reported',entries,...(preview?{preview:true}:{})});
async function connected(fetcher, options={}) {
  const h = harness({fetcher,...options}); const initialized = h.og.init();
  h.send({type:'session',token:'test-only-session',capabilities:['leaderboards'],preview:options.preview});
  await initialized; return h;
}
const turn = () => new Promise(resolve => setImmediate(resolve));

test('offline declarations load lazily once, and every method survives a reload with the best score', async () => {
  const storage = new Map();
  const h = harness({embedded:false,origin:'http://localhost:4592/game/index.html',storage,fetcher:async () => Response.json(manifest)});
  await h.og.init(); assert.equal(h.calls.length,0); assert.ok(h.og.capabilities.includes('leaderboards'));
  const board = h.og.leaderboard('points');
  assert.deepEqual(plain((await board.top()).value.entries),[]);
  assert.equal(h.calls[0].url,'http://localhost:4592/game/opengame.json'); assert.equal(h.calls[0].init.credentials,'omit');
  assert.equal((await board.submit(20.5,{mode:'hard'})).value.best,true);
  assert.equal((await board.submit(10)).value.best,false);
  assert.equal((await board.me()).value.score,20.5);
  assert.equal((await board.around()).value.entries[0].isMe,true);
  assert.equal(h.calls.length,1);
  assert.equal((await h.og.leaderboard('undeclared').top()).error,'board_unavailable');
  const reloaded = harness({embedded:false,origin:'http://localhost:4592/game/index.html',storage});
  await reloaded.og.init({manifest});
  assert.equal((await reloaded.og.leaderboard('points').me()).value.score,20.5);
  const time = reloaded.og.leaderboard('time');
  assert.equal((await time.submit(20)).value.best,true); assert.equal((await time.submit(10.25)).value.best,true);
  assert.equal((await time.submit(12)).value.best,false); assert.equal((await time.me()).value.score,10.25);
  h.og.dispose(); reloaded.og.dispose();
});

test('offline outlier receipts and accepted-score recovery match the hosted contract', async () => {
  const h = harness({embedded:false,origin:'http://localhost:4592'}); await h.og.init({manifest});
  const board = h.og.leaderboard('points');
  assert.deepEqual(plain((await board.submit(150)).value),{state:'clamped',score:100,best:true,preview:false});
  assert.equal((await board.me()).value,null);
  assert.equal((await board.submit(40)).value.best,true);
  assert.equal((await board.submit(150)).value.best,false); assert.equal((await board.me()).value.score,40);
  for (const value of [NaN,Infinity,-Infinity]) assert.equal((await board.submit(value)).error,'invalid_score');
  for (const meta of [{label:'a@b.com'},{label:'１２３４５６７８９'},{email:'private'},{combo:NaN}]) {
    assert.equal((await board.submit(50,meta)).error,'invalid_meta');
  }
  assert.equal((await board.top({limit:0})).error,'invalid_limit'); h.og.dispose();
});

test('hosted methods use one fixed API origin, explicit bearer identity and bounded projections', async () => {
  const h = await connected(async (url,init) => init.method==='POST'
    ? Response.json({ok:true,state:'ok',stored:12.5,best:true}) : Response.json(page([{...row,id:'must-not-expose',user_id:'must-not-expose'}])));
  const board = h.og.leaderboard('points');
  assert.equal((await board.submit(12.5,{mode:'coop'})).value.score,12.5);
  assert.deepEqual(JSON.parse(h.calls[0].init.body),{board:'points',value:12.5,meta:{mode:'coop'}});
  const top = await board.top({limit:10000}); assert.equal(top.value.entries[0].score,42);
  const url = new URL(h.calls[1].url); assert.equal(url.origin,limits.allowedGameOrigins.api);
  assert.equal(url.searchParams.get('host'),'game'); assert.equal(url.searchParams.get('limit'),String(limits.platform.sdk.scoreReadMax));
  assert.equal((await board.me()).value.isMe,true); await board.around();
  assert.deepEqual(h.calls.map(c => new URL(c.url).searchParams.get('view')),[null,'top','me','around']);
  assert.equal(h.calls[2].init.cache,'no-store');
  for (const call of h.calls) { assert.equal(call.init.credentials,'omit'); assert.equal(call.init.redirect,'error'); assert.equal(call.init.headers.Authorization,'Bearer test-only-session'); }
  assert.equal(JSON.stringify(top).includes('must-not-expose'),false);
  assert.equal(JSON.stringify(h.messages).includes('test-only-session'),false); h.og.dispose();
});

test('private previews require private responses and never switch to public or local scores', async () => {
  const origin = `https://p-${'a'.repeat(52)}.opengame.gg`;
  const h = await connected(async () => Response.json(page([row],true)),{origin,preview:true});
  assert.equal((await h.og.leaderboard('points').top()).value.preview,true);
  // The label is the capability; it rides in the Origin header and never in the URL.
  assert.equal(new URL(h.calls[0].url).searchParams.has('host'),false);
  assert.equal(h.calls[0].url.includes('p-'),false);
  const bad = await connected(async () => Response.json(page()),{origin,preview:true});
  assert.equal((await bad.og.leaderboard('points').top()).reason,'invalid_response');
  assert.equal(bad.storage.size,0); h.og.dispose(); bad.og.dispose();
});

test('unavailable, retired, invalid and oversized responses are explicit failures', async () => {
  for (const [status,error] of [[404,'board_unavailable'],[401,'unavailable'],[403,'unavailable'],[429,'rate_limited'],[502,'unavailable']]) {
    const h = await connected(async () => new Response('untrusted diagnostics',{status}));
    const result = await h.og.leaderboard('points').top(); assert.equal(result.error,error); assert.equal(h.calls.length,1); assert.equal(h.storage.size,0); h.og.dispose();
  }
  for (const value of [page([{...row,rank:0}]),page([{...row,is_me:false}]),page([{...row,meta:{email:'private'}}]),page(Array(2).fill(row)),{entries:[]}]) {
    const h = await connected(async () => Response.json(value));
    assert.equal((await h.og.leaderboard('points').me()).reason,'invalid_response'); h.og.dispose();
  }
  const h = await connected(async () => new Response('x'.repeat(limits.platform.sdk.scoreResponseBytesMax+1)));
  assert.equal((await h.og.leaderboard('points').top()).reason,'response_too_large'); h.og.dispose();
});

test('session changes, disposal and request deadlines abort work without stale results', async () => {
  for (const action of ['session_changed','disposed','timeout']) {
    const h = await connected((_url,init) => new Promise((_resolve,reject) => init.signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true})));
    const pending = h.og.leaderboard('points').top(); await turn();
    if (action==='session_changed') h.send({type:'session',token:'next-test-session',capabilities:['leaderboards']});
    else if (action==='disposed') h.og.dispose();
    else [...h.timers.values()].find(t => t.delay===limits.platform.sdk.scoreRequestTimeoutMs).fn();
    assert.equal((await pending).reason,action); assert.equal(h.calls[0].init.signal.aborted,true); h.og.dispose();
  }
});

test('local failures remain visible and a missing manifest can recover on the next request', async () => {
  let found=false;
  const h = harness({embedded:false,origin:'http://localhost:4592',fetcher:async () => found ? Response.json(manifest) : new Response(null,{status:404})});
  const board = h.og.leaderboard('points'); assert.equal((await board.top()).reason,'local_manifest_unavailable');
  found=true; assert.equal((await board.top()).ok,true); assert.equal(h.calls.length,2);
  await board.submit(10); const key = [...h.storage.keys()][0]; h.storage.set(key,'broken');
  assert.equal((await board.top()).reason,'local_storage_unavailable');
  h.storage.delete(key); h.win.localStorage.setItem=()=>{throw Error('denied');};
  assert.equal((await board.submit(10)).reason,'local_storage_unavailable'); h.og.dispose();
  const hosted = harness({embedded:false}); await hosted.og.init({manifest});
  assert.equal((await hosted.og.leaderboard('points').top()).error,'unavailable'); assert.equal(hosted.calls.length,0); hosted.og.dispose();
});

test('a session changed between async state capture and dispatch never sends the old request', async () => {
  for (const change of ['dispose','session']) {
    const h = await connected(async () => Response.json({ok:true,state:'ok',stored:42,best:true}));
    const pending = h.og.leaderboard('points').submit(42);
    queueMicrotask(() => change==='dispose' ? h.og.dispose() : h.send({type:'session',token:'replacement-test-only',capabilities:['leaderboards']}));
    assert.equal((await pending).ok,false);
    assert.equal(h.calls.length,0);
    h.og.dispose();
  }
});

test('local lock waits are bounded and abandoned when the SDK is disposed', async () => {
  const locks = { request: (_key,options,_callback) => new Promise((_resolve,reject) => options.signal.addEventListener('abort',()=>reject(Error('cancelled')),{once:true})) };
  for (const action of ['dispose','timeout']) {
    const h = harness({embedded:false,origin:'http://localhost:4592',locks}); await h.og.init({manifest});
    const pending = h.og.leaderboard('points').submit(42); await turn();
    if (action==='dispose') h.og.dispose();
    else [...h.timers.values()].find(t => t.delay===limits.platform.sdk.scoreRequestTimeoutMs).fn();
    assert.equal((await pending).ok,false); assert.equal(h.storage.size,0); h.og.dispose();
  }
});
