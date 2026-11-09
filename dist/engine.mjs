export const POLICY_VERSION = 'V1.1';
export const STAGES = ['Submission received','Company & tax validation','Bank & identity checks','Document review','Decision & next steps'];
export const normalize = s => String(s||'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/\b(private|pvt|limited|ltd|incorporated|inc|llc|llp|corp|corporation|the)\b/g,'').replace(/[^\p{L}\p{N}]/gu,'');
export const bankKey = v => `${v.country}|${String(v.routing||'').replace(/\s|-/g,'').toUpperCase()}|${String(v.account||'').replace(/\s|-/g,'')}`;
export function evaluate(v, history=[], today=todayISO()) {
 const checks=[];
 const add=(id,stage,label,state,reason,action='')=>checks.push({id,stage,label,state,reason,action});
 const required=['legalName','email','country','address','taxId','bankName','accountName','routing'];
 const missing=required.filter(k=>!String(v[k]||'').trim());
 if(!v.account&&!v.bankFingerprint) missing.push('account');
 const names={legalName:'legal company name',email:'contact email',country:'country',address:'registered address',taxId:'tax ID',bankName:'bank name',accountName:'account holder',routing:'bank routing code',account:'bank account'};
 add('complete',0,'Submission completeness',missing.length?'pending':'pass',missing.length?`Missing ${missing.map(x=>names[x]).join(', ')}.`:'All required company and payment fields are present.',missing.length?'Provide '+missing.map(x=>names[x]).join(', ')+'.':'');
 const emailOk=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email||'');
 add('email',1,'Contact details',emailOk?'pass':'pending',emailOk?`Contact address: ${v.email}`:'The contact email is missing or malformed.',emailOk?'':'Provide a valid contact email.');
 const tax=String(v.taxId||'').replace(/\s/g,'').toUpperCase();
 const countryRules={US:{name:'US EIN',test:t=>/^\d{2}-?\d{7}$/.test(t)},GB:{name:'UK VAT',test:t=>/^(GB)?\d{9}$/.test(t)},IN:{name:'India GSTIN',test:t=>/^(0[1-9]|[12]\d|3[0-8])[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(t)}};
 const rule=countryRules[v.country];
 add('tax',1,'Country-specific tax format',rule&&rule.test(tax)?'pass':'pending',!rule?'This country needs a specialist review.':rule.test(tax)?`${rule.name} format matches ${v.country}. Format check only; registration is not verified.`:`“${v.taxId||'Missing'}” does not match the ${rule.name} format.`,rule&&rule.test(tax)?'':`Provide a valid ${rule?.name||'local tax registration'} or request specialist review.`);
 const canonicalTax=x=>taxKey(x,v.country);
 const duplicate=history.find(x=>x.id!==v.id && x.country===v.country && canonicalTax(x.taxId)===canonicalTax(v.taxId)&&v.taxId);
 add('entity',1,'Duplicate company detection',duplicate?'pending':'pass',duplicate?`Tax ID is already used by ${duplicate.legalName} (${duplicate.id}).`:'No other submission in this workspace uses this tax ID.',duplicate?'Confirm whether this is an update to the existing vendor before creating another record.':'');
 const mixedFields=[['company name',v.legalName],['beneficiary name',v.accountName],...(v.documents||[]).map(d=>[`${d.type} document name`,d.legalName])].filter(([,name])=>hasMixedScripts(name));
 add('script',1,'Name character consistency',mixedFields.length?'pending':'pass',mixedFields.length?`Mixed Latin and Cyrillic/Greek characters detected in ${[...new Set(mixedFields.map(([label])=>label))].join(', ')}. Visually similar letters may represent different names.`:'No mixed Latin and Cyrillic/Greek name characters detected.',mixedFields.length?'Confirm the exact legal name against the issuing document and correct unintended lookalike characters.':'');
 if(v.country==='IN')add('tax-integrity',1,'GSTIN checksum',validGSTIN(tax)?'pass':'pending',validGSTIN(tax)?'GSTIN check digit is internally consistent. This does not verify registration.':'The GSTIN check digit is invalid, even if the number looks correctly formatted.','Confirm the GSTIN from the registration certificate and correct any transcription errors.');
 const n=normalize(v.legalName), b=normalize(v.accountName);
 const same=n&&b&&n===b;
 const partial=n&&b&&(n.includes(b)||b.includes(n));
 add('beneficiary',2,'Beneficiary name match',same?'pass':!n||!b||partial?'pending':'reject',same?'Legal entity and bank beneficiary match after punctuation and company suffix normalization.':partial?`“${v.accountName||'Missing'}” is a partial match to “${v.legalName||'Missing'}”.`:`“${v.accountName||'Missing'}” does not match “${v.legalName||'Missing'}”.`,same?'':'Provide bank-issued proof that the account belongs to the legal entity. A trading name needs supporting documentation.');
 const routing=String(v.routing||'').replace(/[\s-]/g,'').toUpperCase();
 let routeOk=false;
 if(v.country==='US'&&/^\d{9}$/.test(routing)){const d=[...routing].map(Number);routeOk=(3*(d[0]+d[3]+d[6])+7*(d[1]+d[4]+d[7])+d[2]+d[5]+d[8])%10===0 && !/^0+$/.test(routing);}
 if(v.country==='GB')routeOk=/^\d{6}$/.test(routing);
 if(v.country==='IN')routeOk=/^[A-Z]{4}0[A-Z0-9]{6}$/.test(routing);
 const account=String(v.account||'').replace(/[\s-]/g,'');
 const priorFormat=history.find(x=>x.id===v.id&&x.bankFingerprint===v.bankFingerprint&&x.country===v.country);
 const legacyValid=v.accountFormatValid===undefined&&priorFormat?.result?.checks?.find(c=>c.id==='routing')?.state==='pass';
 const accountOk=account?validAccount(account,v.country):v.accountFormatValid===true||legacyValid;
 add('routing',2,'Payment detail validation',routeOk&&accountOk?'pass':'pending',routeOk&&accountOk?'Account structure and routing format pass local validation. Bank ownership is not externally verified.':'Account number or routing code does not meet the selected country’s format.',routeOk&&accountOk?'':'Correct the account number and routing code for the selected country.');
 const collision=v.bankFingerprint&&history.find(x=>x.id!==v.id&&x.bankFingerprint===v.bankFingerprint&&(normalize(x.legalName)!==n||x.country===v.country&&taxKey(x.taxId,x.country)!==canonicalTax(v.taxId)));
 add('collision',2,'Shared bank account detection',collision?'reject':'pass',collision?`This account is also linked to ${collision.legalName} (${collision.id}).`:'No different legal entity in this workspace shares this account fingerprint.',collision?'Request independent bank ownership evidence and investigate the shared account before resubmitting.':'');
 const previous=history.find(x=>x.id===v.id);
 const baseline=approvedBankFor(previous);
 const changed=!!baseline&&!!v.bankFingerprint&&baseline!==v.bankFingerprint;
 const attestation=v.bankVerification;
 const confirmed=changed&&validBankVerification(v,baseline,attestation,today);
 add('bank-change',2,'Approved bank change safeguard',changed&&!confirmed?'pending':'pass',changed?(confirmed?`Independent contact verification recorded by ${attestation.reviewer} on ${attestation.at.slice(0,10)}. Reviewer attestation; no bank API was called.`:'Payment details differ from the last approved account. Matching documents alone cannot release this hold.'):'No change to a previously approved payment account was detected.',changed&&!confirmed?'Independently confirm the new details using a previously trusted vendor contact, then record the reviewer and verification note.':'');
 const docs=v.documents||[];
 for(const type of ['tax','bank','compliance']){
  const doc=docs.find(x=>x.type===type);const title={tax:'Tax registration evidence',bank:'Bank ownership evidence',compliance:'Compliance declaration'}[type];
  if(!doc){add('doc-'+type,3,title,'pending',`No ${title.toLowerCase()} was submitted.`,`Upload ${title.toLowerCase()}.`);continue;}
  if(doc.unsupported){add('doc-'+type,3,title,'pending',`${doc.name}: this file could not be read. OCR is not connected.`,`Provide a readable TXT or JSON ${type} document, or send it for manual review.`);continue;}
  if(doc.documentType&&doc.documentType!==type){add('doc-'+type,3,title,'pending',`${doc.name}: declared document type “${doc.documentType}” does not match the ${type} evidence slot.`,`Upload a ${type} document in the correct slot; an invoice or unrelated file is not sufficient.`);continue;}
  if(!doc.legalName||normalize(doc.legalName)!==n){add('doc-'+type,3,title,'pending',`${doc.name}: the document legal name is missing or inconsistent.`,`Provide ${type} evidence showing the exact registered entity name.`);continue;}
  if(type==='tax'&&(!doc.taxId||canonicalTax(doc.taxId)!==canonicalTax(v.taxId))){add('doc-tax',3,title,'pending',`${doc.name}: document tax ID differs from the submitted tax ID.`, 'Provide tax registration evidence matching the submitted tax ID.');continue;}
  if(type==='bank'&&(!doc.accountLast4||doc.accountLast4!==String(v.accountLast4||account.slice(-4)))){add('doc-bank',3,title,'pending',`${doc.name}: the account ending does not match the submission.`,'Provide a bank letter showing the matching account ending.');continue;}
  if(type==='compliance'&&(!doc.expiresAt||!/^\d{4}-\d{2}-\d{2}$/.test(doc.expiresAt)||!Number.isFinite(Date.parse(doc.expiresAt+'T00:00:00Z'))||new Date(doc.expiresAt+'T00:00:00Z').toISOString().slice(0,10)!==doc.expiresAt||doc.expiresAt<today)){add('doc-compliance',3,title,'pending',`${doc.name}: declaration is expired or has no valid expiry date.`,'Provide a current compliance declaration with an expiry date.');continue;}
  add('doc-'+type,3,title,'pass',`${doc.name}: extracted fields are consistent${doc.expiresAt?`; valid through ${doc.expiresAt}`:''}. Document authenticity has not been verified.`);
 }
 const rejected=checks.some(x=>x.state==='reject');const pending=checks.some(x=>x.state==='pending');
 const status=rejected?'rejected':pending?'pending':'approved';
 const actions=[...new Set(checks.filter(x=>x.state!=='pass').map(x=>x.action).filter(Boolean))];
 return {status,checks,actions,passed:checks.filter(x=>x.state==='pass').length,total:checks.length,policy:POLICY_VERSION,summary:status==='approved'?'All configured consistency checks passed. Ready for the next procurement step.':status==='rejected'?'Payment identity risk detected. Resolve the blocking findings before resubmitting.':'Additional information is needed before this vendor can be approved.'};
}
export function parseDocument(text,name,type){
 let d; try{d=JSON.parse(text);}catch{d={}; for(const line of text.split(/\r?\n/)){const m=line.match(/^\s*(legalName|legal name|taxId|tax id|accountLast4|account last 4|expiresAt|expires at|documentType|document type)\s*:\s*(.+)\s*$/i);if(m){const key={legalname:'legalName',taxid:'taxId',accountlast4:'accountLast4',expiresat:'expiresAt',documenttype:'documentType'}[m[1].toLowerCase().replace(/ /g,'')];d[key]=m[2].trim();}}}
 if(!d||typeof d!=='object'||Array.isArray(d)) d={};
 return {type,name,legalName:String(d.legalName||''),taxId:String(d.taxId||''),accountLast4:String(d.accountLast4||''),expiresAt:String(d.expiresAt||''),documentType:String(d.documentType||'').trim().toLowerCase()};
}
export function followup(v){ const r=v.result;return `To: ${v.email}\nSubject: ${r.status==='approved'?'Onboarding complete':'Action needed: vendor onboarding'} — ${v.legalName}\n\nHello ${v.contactName||'team'},\n\n${r.status==='approved'?'Your submission has passed our configured onboarding checks. Our procurement team will coordinate the next steps.':`Thank you for your submission. Your onboarding status is ${r.status}. Please resolve the following so we can review it again:\n\n${r.actions.map((x,i)=>`${i+1}. ${x}`).join('\n')}`}\n\nReference: ${v.id}\nPlease use your company’s secure channel for payment documents.\n\nProcurement team`; }
export function fixture(kind='happy'){
 const v={legalName:'Atlas Studio LLC',contactName:'Jordan Lee',email:'jordan@atlas.example',country:'US',category:'Design & creative',address:'125 Market Street, San Francisco, CA 94103',taxId:'84-3276195',bankName:'Chase Bank',accountName:'Atlas Studio, LLC',routing:'021000021',account:'7264193058',notes:'Brand strategy and product design partner.'};
 v.documents=[{type:'tax',name:'atlas-tax-registration.json',legalName:v.legalName,taxId:v.taxId},{type:'bank',name:'atlas-bank-letter.json',legalName:v.legalName,accountLast4:'3058'},{type:'compliance',name:'atlas-compliance.json',legalName:v.legalName,expiresAt:'2028-12-31'}];
 if(kind==='missing'){v.legalName='Juniper Packaging LLC';v.accountName=v.legalName;v.taxId='72-6159304';v.account='7349296410';v.documents=[{...v.documents[0],legalName:v.legalName,taxId:v.taxId}];}
 if(kind==='mismatch'){v.legalName='Cobalt Freight LLC';v.accountName='Daniel Brooks';v.taxId='63-8264051';v.account='3284716072';v.documents=v.documents.map(d=>({...d,legalName:v.legalName,taxId:v.taxId,accountLast4:'6072'}));}
 if(kind==='expired'){v.legalName='Fern Analytics Ltd';v.accountName='Fern Analytics Limited';v.country='GB';v.taxId='GB12345';v.routing='200000';v.account='55724319';v.documents=v.documents.map(d=>({...d,legalName:v.legalName,taxId:'GB123456789',accountLast4:'4319',expiresAt:'2024-01-01'}));}
 if(kind==='collision'){v.legalName='Northstar Consulting LLC';v.accountName=v.legalName;v.taxId='35-7824601';v.account='6118342096';v.documents=v.documents.map(d=>({...d,legalName:v.legalName,taxId:v.taxId,accountLast4:'2096'}));}
 if(kind==='lookalike'){v.legalName='Atlaѕ Studio LLC';v.accountName=v.legalName;v.taxId='45-9182736';v.account='6814392075';v.documents=v.documents.map(d=>({...d,legalName:v.legalName,taxId:v.taxId,accountLast4:'2075'}));v.notes='The s in Atlaѕ is Cyrillic (U+0455), although it looks like a Latin s. Confirm the registered spelling.';}
 if(kind==='wrongdoc'){v.legalName='Pine Supply LLC';v.accountName=v.legalName;v.taxId='54-1827369';v.account='6814392076';v.documents=v.documents.map(d=>({...d,legalName:v.legalName,taxId:v.taxId,accountLast4:'2076'}));v.documents[0]={...v.documents[0],name:'pine-invoice.json',documentType:'invoice'};}
 if(kind==='checksum'){v.legalName='Kite Systems Pvt Ltd';v.accountName=v.legalName;v.country='IN';v.taxId='27AAPFU0939F1ZW';v.routing='HDFC0001234';v.account='103847261905';v.bankName='HDFC Bank';v.documents=v.documents.map(d=>({...d,legalName:v.legalName,taxId:v.taxId,accountLast4:'1905'}));}
 if(kind==='bankchange'){v.id='VND-DEMO-CHANGE';v.account='4261738059';v.documents=v.documents.map(d=>({...d,accountLast4:'8059'}));v.notes='An already approved vendor has requested a new payment account. Confirm through a previously trusted contact.';}
 if(kind==='duplicate'){v.legalName='Atlas Studio Services LLC';v.accountName=v.legalName;v.account='6814392079';v.documents=v.documents.map(d=>({...d,legalName:v.legalName,accountLast4:'2079'}));}
 return v;
}

export function todayISO(now=new Date()){
 return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
}
export function taxKey(tax,country){const clean=String(tax||'').replace(/[^a-z0-9]/gi,'').toUpperCase();return country==='GB'?clean.replace(/^GB/,''):clean;}
export function validGSTIN(value){
 const gstin=String(value||'').toUpperCase();
 if(!/^[0-9A-Z]{15}$/.test(gstin))return false;
 const alphabet='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';let factor=2,sum=0;
 for(const c of [...gstin.slice(0,14)].reverse()){
  const product=factor*alphabet.indexOf(c);sum+=Math.floor(product/36)+product%36;factor=factor===2?1:2;
 }
 return alphabet[(36-sum%36)%36]===gstin[14];
}
export const hasMixedScripts=value=>/\p{Script=Latin}/u.test(String(value||''))&&/[\p{Script=Cyrillic}\p{Script=Greek}]/u.test(String(value||''));
export function approvedBankFor(v){
 if(!v)return '';
 return v.approvedBankFingerprint||[...(v.runs||[])].reverse().find(r=>r.status==='approved'&&r.input?.bankFingerprint)?.input.bankFingerprint||(v.result?.status==='approved'?v.bankFingerprint:'')||'';
}
export const entityKey=v=>`${v.country}|${taxKey(v.taxId,v.country)}|${normalize(v.legalName)}`;
export function validBankVerification(v,baseline,note,today=todayISO()){
 return !!note&&note.vendorId===v.id&&Number.isFinite(Date.parse(note.at))&&note.fingerprint===v.bankFingerprint&&note.previousFingerprint===baseline&&note.entityKey===entityKey(v)&&typeof note.reviewer==='string'&&note.reviewer.trim().length>=2&&typeof note.note==='string'&&note.note.trim().length>=20&&note.method==='trusted-channel'&&validDate(String(note.at||'').slice(0,10))&&note.at.slice(0,10)<=today;
}
export function validDate(value){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||'')))return false;
 const d=new Date(value+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;
}
export const daysBetween=(a,b)=>validDate(a)&&validDate(b)?Math.round((Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/86400000):null;
export const datePlus=(date,days)=>new Date(Date.parse(date+'T00:00:00Z')+days*86400000).toISOString().slice(0,10);
export function expirySignal(v,today=todayISO()){
 const doc=v.documents?.find(d=>d.type==='compliance'&&!d.unsupported);
 if(!doc||doc.documentType&&doc.documentType!=='compliance')return null;
 const days=daysBetween(today,doc.expiresAt);
 if(days===null||days>30)return null;
 return {days,date:doc.expiresAt,label:days<0?`Expired ${Math.abs(days)} day${days===-1?'':'s'} ago`:days===0?'Expires today':`Expires in ${days} day${days===1?'':'s'}`};
}
export function reviewPriority(v,today=todayISO()){
 const expiry=expirySignal(v,today);
 const age=Math.max(0,daysBetween(String(v.createdAt||'').slice(0,10),today)||0);
 if(v.result?.status==='rejected')return {rank:100,tier:'urgent',reason:'Blocking payment identity finding'};
 if(v.result?.checks?.some(c=>c.id==='bank-change'&&c.state==='pending'))return {rank:95,tier:'urgent',reason:'Bank change awaiting independent confirmation'};
 if(expiry&&expiry.days<0)return {rank:90,tier:'high',reason:expiry.label};
 if(v.result?.status==='pending'&&age>=2)return {rank:80,tier:'high',reason:`Awaiting resolution for ${age} days`};
 if(expiry)return {rank:70,tier:'high',reason:expiry.label};
 if(v.result?.status==='pending')return {rank:50,tier:'normal',reason:'Additional information required'};
 if(v.result?.policy!==POLICY_VERSION)return {rank:30,tier:'normal',reason:`Recheck with policy ${POLICY_VERSION}`};
 return {rank:0,tier:'clear',reason:'No action due'};
}
export function decisionDelta(before,after){
 return after.checks.filter(c=>before.checks.find(x=>x.id===c.id)?.state!==c.state).map(c=>({id:c.id,label:c.label,before:before.checks.find(x=>x.id===c.id)?.state||'not_run',after:c.state}));
}
export function previewDecision(v,changes,history=[],today=todayISO()){
 const candidate=structuredClone(v);
 if(typeof changes.accountName==='string')candidate.accountName=changes.accountName;
 if(typeof changes.taxId==='string')candidate.taxId=changes.taxId;
 if(changes.syncTaxEvidence)candidate.documents=(candidate.documents||[]).map(d=>d.type==='tax'?{...d,taxId:candidate.taxId}:d);
 if(typeof changes.expiresAt==='string')candidate.documents=(candidate.documents||[]).map(d=>d.type==='compliance'?{...d,expiresAt:changes.expiresAt}:d);
 const result=evaluate(candidate,history,today);
 return {result,delta:decisionDelta(v.result,result),assumptions:changes.syncTaxEvidence?['Tax evidence is assumed to contain the corrected tax ID.']:[]};
}

export function validAccount(account,country){const digits=String(account||'').replace(/[\s-]/g,'');return !/^0+$/.test(digits)&&(country==='GB'?/^\d{8}$/:country==='US'?/^\d{8,17}$/:/^\d{9,18}$/).test(digits);}
