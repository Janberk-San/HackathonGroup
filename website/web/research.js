export async function requestGemma({geoid,metric,question},{signal,chat=false}={}){
 const response=await fetch(`/api/ai/${chat?'chat':'research'}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({geoid,metric,...(question?{question}:{})}),signal});
 const data=await response.json();
 if(!response.ok)throw new Error(typeof data.error==='string'?data.error:'Research is unavailable. Try again.');
 return data;
}
export async function aiStatus(){const response=await fetch('/api/ai/status');if(!response.ok)throw new Error('Status unavailable');return response.json();}
const el=(tag,className,text)=>{const node=document.createElement(tag);node.className=className;node.textContent=text;return node;};
const url=value=>{try{const parsed=new URL(value);return parsed.protocol==='https:'?parsed.href:null;}catch{return null;}};
export function renderReview(container,result){
 container.replaceChildren();
 const message=result.status==='no_relevant_news'?`No relevant coverage found in the past ${result.windowDays||90} days.`:result.summary;
 container.append(el('p','review-summary',typeof message==='string'?message:'Research is unavailable. Try again.'));
 for(const source of Array.isArray(result.articles)?result.articles:[]){
  const href=url(source.url);if(!href)continue;
  const article=el('article','review-article',''),title=el('h3','',''),link=el('a','',source.title);link.href=href;link.target='_blank';link.rel='noreferrer noopener';title.append(link);
  const date=el('time','',source.publishedAt);date.dateTime=source.publishedAt;
  article.append(title,date,el('p','',source.context));container.append(article);
 }
 if(result.searchedAt){const date=new Date(result.searchedAt);if(!Number.isNaN(date.valueOf()))container.append(el('p','review-timestamp',`Researched ${date.toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})} · Past ${result.windowDays||90} days`));}
 if(typeof result.searchSuggestions==='string'&&result.searchSuggestions){const frame=document.createElement('iframe');frame.className='search-suggestions';frame.title='Google Search suggestions';frame.setAttribute('sandbox','allow-popups allow-popups-to-escape-sandbox');frame.srcdoc=result.searchSuggestions;container.append(frame);}
}
