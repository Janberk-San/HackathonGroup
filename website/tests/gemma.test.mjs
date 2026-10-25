import test from 'node:test';
import assert from 'node:assert/strict';
import {cityContext,evidenceFromFeed,newsFeedUrl,normalizeReview,researchArea,handleAI} from '../server/gemma.js';
const now=new Date('2026-10-24T20:00:00Z');
const item=(link,title,date,publisher='Boston Globe')=>`<item><title>${title} - ${publisher}</title><link>${link}</link><pubDate>${date}</pubDate><source url="https://www.bostonglobe.com">${publisher}</source></item>`;
const feed=`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>test</title>${item('https://example.org/boston-report','New prevention program','Tue, 20 Oct 2026 07:00:00 GMT')}${item('javascript:alert(1)','Unsafe','Tue, 20 Oct 2026 07:00:00 GMT')}${item('https://example.org/old','Old story','Mon, 05 Jan 2026 07:00:00 GMT')}${item('https://example.org/boston-report','Duplicate link','Wed, 21 Oct 2026 07:00:00 GMT')}</channel></rss>`;
const raw={summary:'A recent prevention program adds local context. The model remains unchanged.',noRelevantNews:false,articles:[{sourceId:1,relevantToCity:true,context:'The city expanded a prevention program.'}]};
const gemmaReply=()=>Response.json({candidates:[{content:{parts:[{text:JSON.stringify(raw)}]}}]});
test('server uses trusted GEOID data and rejects unknown cities or categories',()=>{
 assert.equal(cityContext('2507000','violent').forecastRate,545.5);assert.equal(cityContext('2507000','property').forecastRate,1957.6);assert.equal(cityContext('250700','violent'),null);assert.equal(cityContext('9999999','violent'),null);assert.equal(cityContext('2507000','generic'),null);
});
test('news feed evidence keeps only safe HTTPS links dated inside the window',()=>{
 const evidence=evidenceFromFeed(feed,now);
 assert.deepEqual(evidence.sources,[{id:1,url:'https://example.org/boston-report',title:'New prevention program',publisher:'Boston Globe',publishedAt:'2026-10-20'}]);
 assert.match(newsFeedUrl(cityContext('2507000','violent')),/^https:\/\/news\.google\.com\/rss\/search\?q=%22Boston%22%20Massachusetts/);
 const review=normalizeReview(raw,evidence,now);assert.equal(review.status,'ready');assert.equal(review.articles[0].url,'https://example.org/boston-report');assert.equal(review.articles[0].publishedAt,'2026-10-20');
 const cited=normalizeReview({...raw,summary:'Business owners want more police [2, 4, 11]. The model is unchanged [1].',articles:[{...raw.articles[0],context:'Owners seek more police [2].'}]},evidence,now);
 assert.equal(cited.summary,'Business owners want more police. The model is unchanged.');assert.equal(cited.articles[0].context,'Owners seek more police.');
 for(const change of [{sourceId:99},{relevantToCity:false},{context:''}]){
  assert.equal(normalizeReview({...raw,articles:[{...raw.articles[0],...change}]},evidence,now).status,'unverified');
 }
 assert.equal(normalizeReview({noRelevantNews:true,articles:[]},evidence,now).status,'no_relevant_news');
 assert.equal(normalizeReview({noRelevantNews:true,articles:[]},{sources:[],searched:false,unavailableSources:0},now).status,'unverified');
});
test('Gemma is the only model: the feed is fetched directly and Gemma synthesizes the headlines',async()=>{
 const requests=[];
 const fetcher=async(url,options)=>{if(url.startsWith('https://news.google.com/rss/search'))return new Response(feed,{headers:{'content-type':'application/rss+xml'}});requests.push({url,options,body:JSON.parse(options.body)});return gemmaReply();};
 const result=await researchArea(cityContext('2507000','violent'),'What is recent?',{GEMINI_API_KEY:'test-key'},{fetcher,now});
 assert.equal(result.status,'ready');assert.equal(result.model,'gemma-4-26b-a4b-it');assert.equal(result.articles[0].title,'New prevention program');assert.equal(result.searchModel,undefined);
 assert.equal(requests.length,1);assert.match(requests[0].url,/\/models\/gemma-4-26b-a4b-it:generateContent$/);assert.doesNotMatch(requests[0].url,/gemini/);assert.equal(requests[0].body.tools,undefined);
 assert.equal(requests[0].options.headers['x-goog-api-key'],'test-key');assert.doesNotMatch(requests[0].url,/test-key/);assert.match(requests[0].body.contents[0].parts[0].text,/Recent headlines/);
 const overridden=await researchArea(cityContext('2507000','violent'),'What is recent?',{GEMINI_API_KEY:'test-key',GEMMA_MODEL:'gemini-3.8-flash'},{fetcher,now});
 assert.equal(overridden.model,'gemma-4-26b-a4b-it');assert.match(requests.at(-1).url,/gemma-4-26b-a4b-it/);
});
test('feed failures are unverified and empty feeds are no news, and neither calls Gemma',async()=>{
 let gemmaCalls=0;
 const failing=async url=>{if(url.startsWith('https://news.google.com'))return new Response('Service unavailable',{status:503});gemmaCalls++;return gemmaReply();};
 const failed=await researchArea(cityContext('2507000','violent'),'Recent context',{GEMINI_API_KEY:'test'},{fetcher:failing,now});
 assert.equal(failed.status,'unverified');assert.equal(failed.reason,'no_search_evidence');
 const empty=async url=>{if(url.startsWith('https://news.google.com'))return new Response('<rss><channel><title>empty</title></channel></rss>');gemmaCalls++;return gemmaReply();};
 const none=await researchArea(cityContext('2507000','violent'),'Recent context',{GEMINI_API_KEY:'test'},{fetcher:empty,now});
 assert.equal(none.status,'no_relevant_news');assert.equal(gemmaCalls,0);
});
test('API validates inputs, preserves secret values, and distinguishes missing configuration from no news',async()=>{
 const req=(body,headers={})=>new Request('https://gaurd.test/api/ai/research',{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});
 const missing=await handleAI(req({geoid:'2507000',metric:'violent'}),{});assert.equal(missing.status,503);assert.equal((await missing.json()).code,'not_configured');
 assert.equal((await handleAI(req({geoid:'9999999'}),{GEMINI_API_KEY:'secret'})).status,400);
 assert.equal((await handleAI(req({geoid:'2507000'},{origin:'https://other.test'}),{GEMINI_API_KEY:'secret'})).status,403);
 const status=await handleAI(new Request('https://gaurd.test/api/ai/status'),{GEMINI_API_KEY:'secret'});assert.deepEqual(await status.json(),{configured:true,model:'gemma-4-26b-a4b-it'});
 const fail=await handleAI(req({geoid:'2507000',question:'Provider failure test'}),{GEMINI_API_KEY:'test-private-key'},{fetcher:async url=>url.startsWith('https://news.google.com')?new Response(feed):Response.json({error:{message:'test-private-key'}},{status:429}),now});
 const text=await fail.text();assert.match(text,/usage limit/);assert.doesNotMatch(text,/test-private-key/);
});
