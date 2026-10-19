// EspaceWeb, GPL-3.0-or-later. Generic EOBD is independent of Renault ECU definitions.
export const PIDS=[
 {id:'010D',key:'speed',name:'Rychlost vozidla',unit:'km/h',bytes:1,decode:a=>a[0]},
 {id:'010C',key:'rpm',name:'Otáčky motoru',unit:'ot/min',bytes:2,decode:a=>(a[0]*256+a[1])/4},
 {id:'0105',key:'coolant',name:'Teplota chladicí kapaliny',unit:'°C',bytes:1,decode:a=>a[0]-40},
 {id:'0104',key:'load',name:'Zatížení motoru',unit:'%',bytes:1,decode:a=>a[0]*100/255},
 {id:'010F',key:'intake',name:'Teplota nasávaného vzduchu',unit:'°C',bytes:1,decode:a=>a[0]-40},
 {id:'010B',key:'map',name:'Absolutní tlak v sání',unit:'kPa',bytes:1,decode:a=>a[0]},
 {id:'0110',key:'maf',name:'Hmotnostní průtok vzduchu',unit:'g/s',bytes:2,decode:a=>(a[0]*256+a[1])/100},
 {id:'0111',key:'throttle',name:'Poloha škrticí klapky',unit:'%',bytes:1,decode:a=>a[0]*100/255},
 {id:'012F',key:'fuel',name:'Hladina paliva',unit:'%',bytes:1,decode:a=>a[0]*100/255},
 {id:'0142',key:'voltage',name:'Napětí řídicí jednotky',unit:'V',bytes:2,decode:a=>(a[0]*256+a[1])/1000},
 {id:'0146',key:'ambient',name:'Venkovní teplota',unit:'°C',bytes:1,decode:a=>a[0]-40}];
export function payloads(text,prefix){
 const lines=text.toUpperCase().split(/[\r\n]+/).map(x=>x.trim());
 const messages=[];let indexed='';
 const flush=()=>{if(indexed)messages.push(indexed);indexed='';};
 for(const line of lines){
  const m=line.match(/^([0-9A-F]):\s*([0-9A-F\s]+)$/);
  if(m){if(m[1]==='0')flush();indexed+=m[2].replace(/\s/g,'');}
  else{flush();const x=line.replace(/\s/g,'');if(/^[0-9A-F]+$/.test(x))messages.push(x);}
 }
 flush();return messages.filter(x=>x.startsWith(prefix)&&x.length%2===0);
}
export function decodePid(text,pid){const p=payloads(text,'41'+pid.id.slice(2))[0];if(!p||p.length<4+pid.bytes*2)return null;const a=p.slice(4).match(/../g).map(x=>parseInt(x,16));return pid.decode(a);}
export function decodeDtcs(text,mode='43'){
 const result=[]; for(const p of payloads(text,mode)){for(let i=2;i+4<=p.length;i+=4){const n=parseInt(p.slice(i,i+4),16);if(!n)continue;result.push('PCBU'[(n>>14)&3]+((n>>12)&3).toString()+ (n&0xfff).toString(16).padStart(3,'0').toUpperCase());}}return [...new Set(result)];
}
export function decodeVin(text){
 const lines=text.toUpperCase().split(/[\r\n]+/).map(x=>x.trim());let h='';
 for(const l of lines){const x=l.replace(/^[0-9A-F]:\s*/, '').replace(/\s/g,'');if(x.startsWith('4902'))h+=x.slice(6);else if(/^[0-9A-F]:/.test(l)&&/^[0-9A-F]+$/.test(x))h+=x;}
 const vin=(h.match(/../g)||[]).map(x=>String.fromCharCode(parseInt(x,16))).join('').replace(/[^A-Z0-9]/g,'');return /^[A-HJ-NPR-Z0-9]{17}$/.test(vin)?vin:null;
}
export class CommandChannel{
 constructor(transport,log=()=>{}){this.transport=transport;this.log=log;this.pending=null;this.buf='';this.tail=Promise.resolve();transport.onData=s=>{this.buf+=s;if(this.pending&&this.buf.includes('>'))this.pending.resolve(this.buf);};}
 command(cmd,timeout=5000){const run=()=>new Promise((resolve,reject)=>{this.buf='';let timer;const done=(fn,value)=>{clearTimeout(timer);this.pending=null;fn(value);};this.pending={resolve:v=>{this.log('rx',v);done(resolve,v);},reject:e=>done(reject,e)};timer=setTimeout(()=>this.pending?.reject(new Error('Adaptér neodpověděl na '+cmd)),timeout);this.log('tx',cmd);Promise.resolve(this.transport.write(cmd+'\r')).catch(e=>this.pending?.reject(e));});const r=this.tail.then(run);this.tail=r.catch(()=>{});return r;}
 cancel(){this.pending?.reject(new Error('Spojení ukončeno'));}
 async init(){await this.command('ATZ');for(const c of ['ATE0','ATL0','ATS0','ATH0','ATCAF1','ATSP0']){const r=await this.command(c);if(!/OK/i.test(r))throw new Error('Adaptér odmítl '+c+': '+r);} }
 async pid(p){return decodePid(await this.command(p.id,10000),p);}
}
