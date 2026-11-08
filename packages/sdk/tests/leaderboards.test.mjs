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
  assert.deepEqual(plain((await board.submit(150)).value),{state:'clamped',score:100,best:true,preview:false,ignored:[]});
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

test('the label imported rows carry is refused before a write leaves the game, and still read', async () => {
  const offline = harness({embedded:false,origin:'http://localhost:4592'}); await offline.og.init({manifest});
  for (const label of ['Before OpenGame','before-opengame','ＢＥＦＯＲＥ OpenGame']) {
    assert.deepEqual(plain(await offline.og.leaderboard('points').submit(50,{label})),{ok:false,error:'invalid_meta',reason:'meta.label is reserved for imported scores'});
  }
  assert.equal((await offline.og.leaderboard('points').me()).value,null); offline.og.dispose();
  let calls = 0;
  const hosted = await connected(async () => { calls++; return Response.json(page([{...row,meta:{label:'Before OpenGame'},imported:true}])); });
  assert.equal((await hosted.og.leaderboard('points').submit(50,{label:'Before OpenGame'})).error,'invalid_meta');
  assert.equal(calls,0);
  assert.equal((await hosted.og.leaderboard('points').top()).value.entries[0].meta.label,'Before OpenGame');
  hosted.og.dispose();
});

test('an imported row says so, and a response from an older API reads as not imported', async () => {
  const old = {player_name:'Kolossfan',score:50,meta:{label:'Before OpenGame'},created_at:'2025-03-01T12:00:00Z',rank:1,imported:true,source:'import'};
  const h = await connected(async () => Response.json(page([old,{...row,is_me:false},{...row,rank:3,is_me:false,imported:'yes'}])));
  const entries = (await h.og.leaderboard('points').top()).value.entries;
  assert.deepEqual(plain(entries.map(entry => entry.imported)),[true,false,false]);
  assert.deepEqual(plain(Object.keys(entries[0]).sort()),['createdAt','imported','isMe','meta','name','rank','score','stats','tags']);
  assert.deepEqual(plain([entries[0].stats,entries[0].tags]),[{},{}]);
  assert.equal(entries[0].meta.label,'Before OpenGame'); h.og.dispose();
  const local = harness({embedded:false,origin:'http://localhost:4592'}); await local.og.init({manifest});
  await local.og.leaderboard('points').submit(10);
  assert.equal((await local.og.leaderboard('points').me()).value.imported,false); local.og.dispose();
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

/* Der Koloss's board as the brief declares it: the round is the score, five stats beside
   it, solo and co-op, every run kept. */
const runs = { leaderboards: [{ key:'rounds',label:'Rounds survived',order:'desc',min:1,max:500,scoreLabel:'Round',format:'integer',keep:'runs',runsPerPlayer:50,
  columns:[{key:'kills',label:'Kills',format:'integer',min:0,max:100000},{key:'downs',label:'Downs',format:'integer',order:'asc'},
    {key:'revives',label:'Revives',format:'integer'},{key:'points',label:'Points',format:'integer'},{key:'time',label:'Time',format:'duration_s',order:'asc',sortable:false}],
  variants:[{key:'mode',label:'Mode',values:[{key:'solo',label:'Solo'},{key:'coop',label:'Co-op'}]}] }] };
const shapeOnWire = { label:'Rounds survived', scoreLabel:'Round', format:'integer', keep:'runs',
  columns: runs.leaderboards[0].columns.map(({key,label,format='number',order='desc',sortable=true}) => ({key,label,format,order,sortable})),
  variants: runs.leaderboards[0].variants };
const run = { player_name:'orbit',score:14,stats:{kills:212,downs:1,revives:3,points:18420,time:1284.5},tags:{mode:'coop'},meta:{},created_at:'2026-11-06T00:00:00Z',rank:1 };
const roundsPage = (extra={}) => ({ board:'rounds',direction:'desc',source:'game_reported',entries:[run],total:2239,offset:0,sort:'score',filter:{},shape:shapeOnWire,...extra });

test('a run carries stats and tags, locally with the shared checks and one entry a board', async () => {
  const h = harness({embedded:false,origin:'http://localhost:4592'}); await h.og.init({manifest:runs});
  const board = h.og.leaderboard('rounds');
  const saved = await board.submitRun({ value:14, stats:{kills:212,downs:1,headshots:9}, tags:{mode:'coop'}, meta:{character:'nikolai'} });
  assert.deepEqual(plain(saved.value),{state:'ok',score:14,best:true,preview:false,ignored:['stats.headshots']});
  const top = (await board.top()).value;
  assert.deepEqual(plain(top.entries[0].stats),{kills:212,downs:1}); assert.deepEqual(plain(top.entries[0].tags),{mode:'coop'});
  assert.deepEqual(plain([top.total,top.offset,top.sort,top.filter]),[1,0,'score',{}]);
  assert.deepEqual(plain(top.shape),shapeOnWire);
  assert.equal((await board.top({filter:{mode:'coop'}})).value.entries.length,1);
  assert.deepEqual(plain((await board.top({filter:{mode:'solo'}})).value),{...plain(top),entries:[],total:0,filter:{mode:'solo'}});
  assert.equal((await board.me({sort:'kills',filter:{mode:'coop'}})).value.score,14);
  const later = (await board.top({offset:1})).value;
  assert.equal(later.entries.length,0); assert.equal(later.total,1,'the count holds on a later page, as hosted');
  // One entry a board locally, as before, whatever the keep rule says: a worse run does not replace it.
  assert.equal((await board.submitRun({value:9,tags:{mode:'solo'}})).value.best,false);
  assert.deepEqual(plain((await board.me()).value.tags),{mode:'coop'});
  // A stat past its column's bounds is judged as the score is, and the run takes the worse state.
  assert.deepEqual(plain((await board.submitRun({value:20,stats:{kills:100001}})).value),{state:'clamped',score:20,best:false,preview:false,ignored:[]});
  assert.equal((await board.submitRun({value:20,stats:{kills:10_000_000}})).value.state,'rejected');
  // submit(value, meta) is still a run with no stats and no tags.
  assert.equal((await board.submit(30)).value.best,true);
  assert.deepEqual(plain([(await board.me()).value.stats,(await board.me()).value.tags]),[{},{}]);
  for (const [bad,reason] of [[{value:1,tags:{mode:'duo'}},/tags.mode must be one of solo, coop/],[{value:1,tags:{map:'dunes'}},/not a variant/],
    [{value:1,stats:{kills:'many'}},/finite numbers/],[{value:1,stats:{kills:NaN}},/finite numbers/],[{value:1,tags:{mode:1}},/value keys/]]) {
    const result = await board.submitRun(bad); assert.equal(result.error,'invalid_run'); assert.match(result.reason,reason);
  }
  assert.equal((await board.submitRun(null)).error,'invalid_score');
  for (const query of [{sort:'time'},{sort:'nope'},{filter:{mode:'duo'}},{filter:{mode:'a,b'}},{offset:-1},{offset:limits.platform.sdk.scoreReadOffsetMax+1}]) {
    assert.equal((await board.top(query)).error,'invalid_query',JSON.stringify(query));
  }
  assert.equal((await board.around({offset:1})).error,'invalid_query');
  h.og.dispose();
});

test('local declarations are read by the shared parser, with its reason', async () => {
  for (const [leaderboards,reason] of [[[{...runs.leaderboards[0],runsPerPlayer:undefined}],/sets runsPerPlayer/],
    [[{key:'rounds',order:'desc',columns:[{key:'score',label:'Score'}]}],/score is reserved/],
    [[{key:'rounds',order:'desc',unit:'rounds'}],/Unknown leaderboard field: unit/],
    [[{key:'rounds',order:'desc'},{key:'rounds',order:'asc'}],/declared twice/]]) {
    const h = harness({embedded:false,origin:'http://localhost:4592'}); await h.og.init({manifest:{leaderboards}});
    const result = await h.og.leaderboard('rounds').top();
    assert.equal(result.error,'invalid_manifest'); assert.match(result.reason,reason); h.og.dispose();
  }
});

test('hosted runs send stats and tags only when they have them, and reads say back what they applied', async () => {
  let answer = roundsPage();
  const h = await connected(async (url,init) => init.method==='POST'
    ? Response.json({ok:true,state:'ok',stored:14,best:true,ignored:['stats.headshots']}) : Response.json(typeof answer === 'function' ? answer(new URL(url)) : answer));
  const board = h.og.leaderboard('rounds');
  assert.deepEqual(plain((await board.submitRun({value:14,stats:{kills:212},tags:{mode:'coop'}})).value.ignored),['stats.headshots']);
  assert.deepEqual(JSON.parse(h.calls[0].init.body),{board:'rounds',value:14,meta:{},stats:{kills:212},tags:{mode:'coop'}});
  await board.submit(14,{mode:'hard'});
  assert.deepEqual(JSON.parse(h.calls[1].init.body),{board:'rounds',value:14,meta:{mode:'hard'}});
  const top = (await board.top()).value;
  assert.deepEqual(plain(top.entries[0].stats),run.stats); assert.equal(top.total,2239); assert.deepEqual(plain(top.shape),shapeOnWire);
  // A plain read is the request an older API already answered.
  assert.deepEqual([...new URL(h.calls[2].url).searchParams.keys()],['board','host','view','limit']);
  answer = url => roundsPage({ offset:Number(url.searchParams.get('offset') ?? 0), sort:url.searchParams.get('sort') ?? 'score',
    filter:Object.fromEntries((url.searchParams.get('filter') ?? '').split(',').filter(Boolean).map(part => part.split(':'))) });
  const paged = await board.top({limit:20,offset:40,sort:'kills',filter:{mode:'solo'}});
  assert.deepEqual(plain([paged.value.offset,paged.value.sort,paged.value.filter]),[40,'kills',{mode:'solo'}]);
  const sent = new URL(h.calls[3].url).searchParams;
  assert.deepEqual([sent.get('offset'),sent.get('sort'),sent.get('filter')],['40','kills','mode:solo']);
  answer = url => ({...roundsPage({sort:url.searchParams.get('sort') ?? 'score', filter:{mode:'solo'}}), entries:[{...run,is_me:true}]});
  assert.equal((await board.me({sort:'kills',filter:{mode:'solo'}})).value.isMe,true);
  h.og.dispose();
});

test('a page an older API answered reads as empty stats and no shape, and one that ignored the query is refused', async () => {
  const old = {board:'rounds',direction:'desc',source:'game_reported',entries:[{player_name:'orbit',score:14,meta:{},created_at:'2026-11-06T00:00:00Z',rank:1}]};
  let answer = old;
  const h = await connected(async () => Response.json(answer));
  const board = h.og.leaderboard('rounds');
  const page = (await board.top()).value;
  assert.deepEqual(plain([page.total,page.offset,page.sort,page.filter,page.shape,page.entries[0].stats,page.entries[0].tags]),[null,0,'score',{},null,{},{}]);
  // An API that does not know filter answers the whole board; shown under Solo, that would be wrong.
  for (const query of [{filter:{mode:'solo'}},{sort:'kills'},{offset:50}]) assert.equal((await board.top(query)).reason,'invalid_response',JSON.stringify(query));
  for (const bad of [roundsPage({total:-1}),roundsPage({total:'2239'}),roundsPage({filter:{mode:1}}),roundsPage({shape:{...shapeOnWire,keep:'all'}}),
    roundsPage({shape:{...shapeOnWire,columns:'kills'}}),roundsPage({entries:[{...run,stats:{kills:'212'}}]}),
    roundsPage({entries:[{...run,tags:{mode:2}}]}),roundsPage({entries:[{...run,stats:[1]}]})]) {
    answer = bad; assert.equal((await board.top()).reason,'invalid_response',JSON.stringify(bad).slice(0,160));
  }
  // A shape from a newer og-api still reads: published games carry this SDK for ever, so an
  // unknown field is ignored, an unknown format reads as a number and no cap is applied.
  answer = roundsPage({shape:{...shapeOnWire,rank:'new',format:'furlongs',columns:[...shapeOnWire.columns,
    ...Array.from({length:12},(_, i) => ({key:`c${i}`,label:`C${i}`,format:'parsecs',unit:'x'}))]}});
  const wider = await board.top();
  assert.equal(wider.ok,true,wider.reason);
  assert.equal(wider.value.shape.format,'number');
  assert.equal(wider.value.shape.columns.length,shapeOnWire.columns.length+12);
  assert.equal(wider.value.shape.columns.at(-1).format,'number');
  h.og.dispose();
});

/* A career board (keep "career"): fed by the database from its source board's accepted runs,
   read like any board and never submitted to. CAREER.md's Smash Royale declaration. */
const maps = [{key:'map',label:'Map',values:[{key:'sunreach',label:'Sunreach Shores'},{key:'riftwild',label:'Riftwild'}]}];
const smash = { leaderboards: [
  { key:'kills',label:'KOs in a match',order:'desc',min:0,max:89,format:'integer',
    columns:[{key:'placement',label:'Place',format:'integer',order:'asc',min:1,max:90}],variants:maps },
  { key:'career',label:'Career',order:'desc',keep:'career',from:'kills',scoreAgg:'sum',scoreLabel:'Eliminations',format:'integer',
    columns:[{key:'matches',label:'Matches',agg:'count',format:'integer'},
      {key:'wins',label:'Wins',agg:'count',where:{of:'placement',op:'eq',value:1},format:'integer'},
      {key:'win_rate',label:'Win rate',agg:'ratio',of:['wins','matches'],scale:100,requires:{column:'matches',atLeast:5},format:'percent'},
      {key:'avg_place',label:'Avg. place',agg:'avg',of:'placement',order:'asc',format:'number'},
      {key:'best',label:'Best match',agg:'max',of:'score',format:'integer'}],variants:maps } ] };
const careerOnWire = { label:'Career', scoreLabel:'Eliminations', format:'integer', keep:'career', from:'kills', scoreAgg:'sum',
  columns:[{key:'matches',label:'Matches',format:'integer',order:'desc',sortable:true,agg:'count',of:null,where:null},
    {key:'wins',label:'Wins',format:'integer',order:'desc',sortable:true,agg:'count',of:null,where:{of:'placement',op:'eq',value:1}},
    {key:'win_rate',label:'Win rate',format:'percent',order:'desc',sortable:true,decimals:1,agg:'ratio',of:['wins','matches'],scale:100,requires:{column:'matches',atLeast:5}},
    {key:'avg_place',label:'Avg. place',format:'number',order:'asc',sortable:true,decimals:1,agg:'avg',of:'placement',where:null},
    {key:'best',label:'Best match',format:'integer',order:'desc',sortable:true,agg:'max',of:'score',where:null}], variants:maps };

test('a career board refuses a run locally, before any write, and reads its shape like any board', async () => {
  const storage = new Map();
  const h = harness({embedded:false,origin:'http://localhost:4592',storage}); await h.og.init({manifest:smash});
  const career = h.og.leaderboard('career');
  for (const result of [await career.submit(12),await career.submitRun({value:12,stats:{matches:1},tags:{map:'riftwild'}})]) {
    assert.equal(result.error,'invalid_run'); assert.match(result.reason,/career board, fed by kills; submit runs there/);
  }
  assert.equal(storage.size,0,'nothing was stored');
  const top = (await career.top({sort:'avg_place',filter:{map:'riftwild'}})).value;
  assert.deepEqual(plain(top.shape),careerOnWire); assert.deepEqual(plain(top.entries),[]);
  // Its source takes runs as any board does.
  assert.equal((await h.og.leaderboard('kills').submitRun({value:7,stats:{placement:1},tags:{map:'sunreach'}})).value.best,true);
  h.og.dispose();
});

test('local career declarations are cross-checked against their source, as a deploy checks them', async () => {
  const [source, career] = smash.leaderboards;
  for (const [leaderboards,reason] of [[[career],/fed from kills, which this game does not declare/],
    [[source,{...career,columns:[{key:'best',label:'Best',agg:'max',of:'headshots'}]}],/headshots is not kills's score or one of its columns/],
    [[source,{...career,variants:[{key:'map',label:'Map',values:[{key:'dunes',label:'Dunes'}]}]}],/variant map must be one of kills's/],
    [[source,{...career,min:0}],/no bounds of its own/]]) {
    const h = harness({embedded:false,origin:'http://localhost:4592'}); await h.og.init({manifest:{leaderboards}});
    const result = await h.og.leaderboard('career').top();
    assert.equal(result.error,'invalid_manifest'); assert.match(result.reason,reason); h.og.dispose();
  }
});

test('a hosted career page reads its source and aggregates, ignores what it does not know, and passes the refusal through', async () => {
  const entry = { player_name:'orbit',score:41,stats:{matches:6,wins:2,win_rate:33.3,avg_place:4.5,best:12},tags:{},meta:{},created_at:'2026-11-07T00:00:00Z',rank:1 };
  let answer = { board:'career',direction:'desc',source:'game_reported',entries:[entry],total:1,offset:0,sort:'score',filter:{},shape:careerOnWire };
  const h = await connected(async (url,init) => init.method==='POST'
    ? Response.json({error:'rejected',reason:'career boards are fed by their source board'},{status:400}) : Response.json(answer));
  const career = h.og.leaderboard('career');
  const top = (await career.top()).value;
  assert.deepEqual(plain(top.shape),careerOnWire); assert.deepEqual(plain(top.entries[0].stats),entry.stats);
  // A newer og-api's extra fields on a career shape are ignored, and a malformed aggregate reads as null.
  answer = {...answer,shape:{...careerOnWire,feedVersion:2,columns:[{...careerOnWire.columns[0],window:'season',of:7,where:'x'}]}};
  const wider = (await career.top()).value.shape;
  assert.deepEqual(plain(wider.columns),[{...careerOnWire.columns[0],of:null,where:null}]);
  assert.equal('feedVersion' in wider,false);
  // Hosted, the SDK does not know the board is a career board before it asks; og-api's 400 is the answer.
  assert.equal((await career.submit(5)).error,'invalid_request');
  h.og.dispose();
});
