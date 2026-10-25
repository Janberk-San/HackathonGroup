import test from 'node:test';
import assert from 'node:assert/strict';
import {cityContext,evidenceFrom,normalizeReview,researchArea,handleAI,verifySources} from '../server/gemma.js';
const now=new Date('2026-10-24T20:00:00Z');
const grounded={candidates:[{content:{parts:[{text:'Boston local newspaper: crime-prevention program, published 2026-10-20.'}]},groundingMetadata:{webSearchQueries:['Boston MA crime prevention October 2026'],groundingChunks:[{web:{uri:'https://example.org/boston-report',title:'Boston report'}},{web:{uri:'javascript:alert(1)',title:'Unsafe'}}]}}]};
const raw={summary:'A recent prevention program adds local context. The model remains unchanged.',noRelevantNews:false,articles:[{sourceId:1,title:'New prevention program',publishedAt:'2026-10-20',relevantToCity:true,context:'The city expanded a prevention program.'}]};
test('server uses trusted GEOID data and rejects unknown cities or categories',()=>{
 assert.equal(cityContext('2507000','violent').forecastRate,545.5);assert.equal(cityContext('2507000','property').forecastRate,1957.6);assert.equal(cityContext('250700','violent'),null);assert.equal(cityContext('9999999','violent'),null);assert.equal(cityContext('2507000','generic'),null);
});
test('research only includes grounded HTTPS sources in the current date window',()=>{
 const evidence=evidenceFrom(grounded);assert.equal(evidence.sources.length,1);
 const review=normalizeReview(raw,evidence,now);assert.equal(review.status,'ready');assert.equal(review.articles[0].url,'https://example.org/boston-report');
 for(const change of [{sourceId:99},{publishedAt:'2020-01-01'},{publishedAt:'2026-12-01'},{publishedAt:'2026-02-31'},{relevantToCity:false}]){
  assert.equal(normalizeReview({...raw,articles:[{...raw.articles[0],...change}]},evidence,now).status,'unverified');
 }
 assert.equal(normalizeReview({noRelevantNews:true,articles:[]},evidence,now).status,'no_relevant_news');
 assert.equal(normalizeReview({noRelevantNews:true,articles:[]},{sources:[],searched:false},now).status,'unverified');
});
test('Gemma searches first and synthesizes only the grounded evidence',async()=>{
 const requests=[];let i=0;
 const fetcher=async(url,options)=>{if(url.startsWith('https://example.org'))return new Response('<html><head><title>New prevention program</title><meta property="article:published_time" content="2026-10-20"></head></html>',{headers:{'content-type':'text/html'}});requests.push({url,options,body:JSON.parse(options.body)});return Response.json(i++===0?grounded:{candidates:[{content:{parts:[{text:JSON.stringify(raw)}]}}]});};
 const result=await researchArea(cityContext('2507000','violent'),'What is recent?',{GEMINI_API_KEY:'test-key'},{fetcher,now});
 assert.equal(result.status,'ready');assert.equal(requests.length,2);assert.deepEqual(requests[0].body.tools,[{googleSearch:{}}]);assert.equal(requests[1].body.tools,undefined);
 assert.match(requests[0].url,/gemini-3.8-flash:generateContent/);assert.match(requests[1].url,/gemma-4-26b-a4b-it:generateContent/);assert.equal(requests[0].options.headers['x-goog-api-key'],'test-key');assert.doesNotMatch(requests[0].url,/test-key/);assert.match(requests[1].body.contents[0].parts[0].text,/Allowed source IDs/);
});
test('API validates inputs, preserves secret values, and distinguishes missing configuration from no news',async()=>{
 const req=(body,headers={})=>new Request('https://gaurd.test/api/ai/research',{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});
 const missing=await handleAI(req({geoid:'2507000',metric:'violent'}),{});assert.equal(missing.status,503);assert.equal((await missing.json()).code,'not_configured');
 assert.equal((await handleAI(req({geoid:'9999999'}),{GEMINI_API_KEY:'secret'})).status,400);
 assert.equal((await handleAI(req({geoid:'2507000'},{origin:'https://other.test'}),{GEMINI_API_KEY:'secret'})).status,403);
 const status=await handleAI(new Request('https://gaurd.test/api/ai/status'),{GEMINI_API_KEY:'secret'});assert.deepEqual(await status.json(),{configured:true,model:'gemma-4-26b-a4b-it'});
 const fail=await handleAI(req({geoid:'2507000',question:'Provider failure test'}),{GEMINI_API_KEY:'test-private-key'},{fetcher:async()=>Response.json({error:{message:'test-private-key'}},{status:429}),now});
 const text=await fail.text();assert.match(text,/usage limit/);assert.doesNotMatch(text,/test-private-key/);
});
test('publisher blocks fall back to successfully retrieved URL context before Gemma synthesis',async()=>{
 let step=0;const tools=[];
 const fetcher=async(url,options)=>{
  if(url.startsWith('https://example.org'))return new Response('Blocked',{status:403});
  const body=JSON.parse(options.body);tools.push(body.tools);
  if(step++===0)return Response.json(grounded);
  if(step===2)return Response.json({candidates:[{urlContextMetadata:{urlMetadata:[{retrievedUrl:'https://example.org/boston-report',urlRetrievalStatus:'URL_RETRIEVAL_STATUS_SUCCESS'}]},content:{parts:[{text:JSON.stringify({sources:[{id:1,title:'Verified headline',publishedAt:'2026-10-20',url:'https://example.org/boston-report'}]})}]}}]});
  return Response.json({candidates:[{content:{parts:[{text:JSON.stringify(raw)}]}}]});
 };
 const result=await researchArea(cityContext('2507000','violent'),'Recent context',{GEMINI_API_KEY:'test'},{fetcher,now});
 assert.equal(result.status,'ready');assert.equal(result.articles[0].title,'Verified headline');assert.deepEqual(tools,[[{googleSearch:{}}],[{urlContext:{}}],undefined]);
});
