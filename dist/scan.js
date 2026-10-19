// EspaceWeb GPL-3.0-or-later. Identifier locations follow DDT4All's CAN scanner.
export const normalizedHex=s=>String(s??'').replace(/\s/g,'').toUpperCase();
const text=h=>String.fromCharCode(...(h.match(/../g)||[]).map(x=>parseInt(x,16))).replace(/[\x00\xFF\s]+$/g,'');
export function canAddress(ecu){const tx=normalizedHex(ecu.toIdHex),rx=normalizedHex(ecu.fromIdHex);if(!/CAN/i.test(ecu.protocol)||!([tx,rx].every(x=>/^(?:[0-9A-F]{3}|[0-9A-F]{8})$/.test(x)))||tx.length!==rx.length||parseInt(tx,16)>(tx.length===3?0x7ff:0x1fffffff)||parseInt(rx,16)>(rx.length===3?0x7ff:0x1fffffff))return null;return tx+':'+rx;}
export function identifyReplies(replies){
 const get=q=>{const r=normalizedHex(replies[q]);return r.startsWith('62'+q.slice(2))?r.slice(6):'';};
 const diag=get('22F1A0');if(diag&&get('22F18A')&&get('22F194')&&get('22F195'))return {method:'UDS',diagversion:diag.slice(0,2),supplier:text(get('22F18A')),soft:text(get('22F194')),version:text(get('22F195'))};
 const old=normalizedHex(replies['2180']);if(old.startsWith('6180')&&old.length>=40)return {method:'KWP/CAN',diagversion:old.slice(14,16),supplier:text(old.slice(16,22)),soft:old.slice(32,36),version:old.slice(36,40)};
 return null;
}
export function matchesIdent(ecu,ident){if(!ident||!Array.isArray(ecu.autoidents))return false;return ecu.autoidents.some(a=>{if(!['diagversion','supplier','soft','version'].every(k=>String(a[k]??'').trim()))return false;const number=s=>{try{return BigInt('0x'+String(s).replace(/^0x/i,''));}catch{return null;}};const d=number(a.diagversion);return d!==null&&d===number(ident.diagversion)&&['supplier','soft','version'].every(k=>String(a[k]).trim().toUpperCase()===String(ident[k]).trim().toUpperCase());});}
export async function scanCan(ecus,{request,signal,onProgress=()=>{},allowSessions=false}){
 const groups=new Map(),skipped=[];for(const ecu of ecus){const key=canAddress(ecu);if(!key){skipped.push(ecu.name);continue;}if(!groups.has(key))groups.set(key,[]);groups.get(key).push(ecu);}
 if(groups.size>128)throw Error('Příliš mnoho CAN adres. Omezte výběr na konkrétní vozidlo (nejvýše 128 adres).');
 const results=[];let done=0;for(const [address,definitions] of groups){if(signal?.aborted)break;const ecu=definitions[0],replies={},errors=[];let answered=false,session=false;
 const probe=async q=>{try{const r=normalizedHex(await request(ecu,q,900));const expected=(parseInt(q.slice(0,2),16)+64).toString(16).toUpperCase()+q.slice(2);if(r.startsWith(expected)){replies[q]=r;answered=true;}}catch(e){errors.push(q+': '+e.message);}};
 try{for(const q of ['22F1A0','22F18A','22F194','22F195']){if(signal?.aborted)break;await probe(q);}if(!identifyReplies(replies)&&!signal?.aborted)await probe('2180');
 if(!identifyReplies(replies)&&allowSessions&&!signal?.aborted){for(const s of ['1003','10C0']){if(signal?.aborted)break;try{const r=normalizedHex(await request(ecu,s,1000));if(!r.startsWith('50'+s.slice(2)))continue;session=true;for(const q of ['22F1A0','22F18A','22F194','22F195','2180']){if(signal?.aborted)break;await probe(q);}if(identifyReplies(replies))break;}catch(e){errors.push(e.message);}}}
 }finally{if(session){try{await request(ecu,'1001',1000);}catch(e){errors.push('Návrat do výchozí relace nepotvrzen: '+e.message);}}}
 const identity=identifyReplies(replies),matches=definitions.filter(d=>matchesIdent(d,identity));const row={address,answered,identity,matches:matches.map(d=>d.name),candidates:definitions.map(d=>d.name),replies,errors,interrupted:!!signal?.aborted};results.push(row);onProgress({done:++done,total:groups.size,row});}
 return {results,skipped,cancelled:!!signal?.aborted};
}
