import { z } from 'zod';
import type { DesignNode, Project } from './model';

const number=z.number().finite().min(-1e7).max(1e7), positive=number.nonnegative();
const color=z.string().regex(/^(#[\da-f]{3,8}|rgba?\([\d., %]+\)|transparent)$/i);
const matrix=z.tuple([number,number,number,number,number,number]);
const bounds=z.object({x:number,y:number,width:positive,height:positive});
const name=z.string().max(2000000), id=z.string().min(1).max(1000);
const paint=z.discriminatedUnion('type',[
  z.object({type:z.literal('none')}), z.object({type:z.literal('solid'),color}),
  z.object({type:z.enum(['linear','radial']),stops:z.array(z.object({offset:z.number().min(0).max(1),color})).max(1000),x1:number,y1:number,x2:number,y2:number}),
  z.object({type:z.literal('image'),assetId:id,fit:z.enum(['cover','contain','stretch']),transform:matrix.optional(),width:positive.optional(),height:positive.optional()}),
]);
const style=z.object({fill:paint,opacity:z.number().min(0).max(1),stroke:z.object({color,width:positive,align:z.enum(['inside','center','outside']),dash:z.array(positive).max(100).optional()}).optional(),shadows:z.array(z.object({x:number,y:number,blur:positive,color})).max(100),blendMode:z.enum(['multiply','screen','overlay','darken','lighten','color-dodge','color-burn','hard-light','soft-light','difference','exclusion','hue','saturation','color','luminosity']).optional()});
const text=z.object({value:name,family:name,size:positive,weight:z.number().int().min(100).max(900),italic:z.boolean(),spacing:number,lineHeight:positive,align:z.enum(['left','center','right']),lines:z.array(z.object({from:positive,to:positive,x:number,y:number})).max(50000),runs:z.array(z.object({from:positive,to:positive,family:name,size:positive,weight:z.number().int().min(100).max(900),italic:z.boolean(),spacing:number,color})).max(50000),estimatedBounds:z.boolean()});
const node: z.ZodType<DesignNode> = z.lazy(()=>z.object({id,sourceId:id,name,kind:z.enum(['artboard','group','rect','ellipse','path','line','text','unsupported']),bounds,transform:matrix,style,visible:z.boolean(),children:z.array(node),radius:z.tuple([positive,positive,positive,positive]).optional(),path:name.optional(),text:text.optional(),clip:node.optional(),viewportHeight:positive.optional()}));
const interaction=z.object({
  click:z.object({action:z.enum(['toggle','scroll','navigate']),target:id}).optional(),
  hover:z.object({effect:z.enum(['lift','scale','fade']),duration:z.number().min(0).max(30000)}).optional(),
  scroll:z.object({effect:z.literal('reveal'),threshold:z.number().min(0).max(1),duration:z.number().min(0).max(30000)}).optional(),
  position:z.object({mode:z.enum(['sticky','fixed']),top:number}).optional(),
  animation:z.object({effect:z.enum(['fade','slide','pulse']),duration:z.number().min(1).max(30000),repeat:z.boolean()}).optional(),
});
const layout=z.object({mode:z.enum(['absolute','row','column','grid']),responsive:z.enum(['fixed','scale','stretch','right','center']),gap:positive,padding:positive,columns:z.number().int().min(1).max(12),mobileStack:z.boolean(),tag:z.enum(['div','section','header','footer','nav','main','article','button','h1','h2','p'])});
const schema=z.object({format:z.literal('xd-local-project'),version:z.literal(1),document:z.object({version:z.literal(1),name,artboards:z.array(node).min(1).max(1000),assets:z.record(id,z.object({id,name,mime:z.enum(['image/png','image/jpeg','image/webp','image/gif']),data:z.string().regex(/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/)})),diagnostics:z.array(z.object({code:name,message:name,nodeId:id.optional()})).max(5000),source:z.enum(['xd','demo'])}),interactions:z.record(id,interaction),layouts:z.record(id,layout)});

export function parseProject(json: string): Project {
  if (json.length>180*1024*1024) throw new Error('工作檔超過 180 MB 上限。');
  let raw: unknown;
  try { raw=JSON.parse(json); } catch { throw new Error('工作檔不是有效的 JSON。'); }
  let count=0;
  function guard(value: unknown, depth=0) {
    if (++count>2000000 || depth>350) throw new Error('工作檔資料過大或巢狀過深。');
    if(value && typeof value==='object') for(const [key,v] of Object.entries(value)) {
      if(['__proto__','prototype','constructor'].includes(key)) throw new Error('工作檔含不安全的屬性。');
      guard(v,depth+1);
    }
  }
  guard(raw);
  const result=schema.safeParse(raw);
  if(!result.success) throw new Error(`不支援或損毀的工作檔：${result.error.issues[0]?.path.join('.')}`);
  const ids=new Set<string>();
  function check(n:DesignNode,depth=0) {
    if(depth>100||ids.size>50000) throw new Error('圖層超過數量或深度上限。');
    if(ids.has(n.id)) throw new Error('工作檔包含重複圖層 ID。');
    ids.add(n.id); n.children.forEach(c=>check(c,depth+1));
    if(n.clip) check(n.clip,depth+1);
  }
  result.data.document.artboards.forEach(n=>{if(n.kind!=='artboard') throw new Error('工作檔根節點必須是畫板。');check(n);});
  return result.data;
}
export function serializeProject(project: Project): string { return JSON.stringify(project); }

function database(): Promise<IDBDatabase> {
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open('xd-local-studio',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('workspace');
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });
}
export async function saveLocal(project: Project): Promise<void> {
  const db=await database();
  try { await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction('workspace','readwrite');tx.objectStore('workspace').put(serializeProject(project),'current');
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  }); } finally { db.close(); }
}
export async function restoreLocal(): Promise<Project|undefined> {
  const db=await database();
  try { return await new Promise((resolve,reject)=>{
    const request=db.transaction('workspace').objectStore('workspace').get('current');
    request.onsuccess=()=>{try {resolve(request.result?parseProject(request.result):undefined);}catch(error){reject(error);}};
    request.onerror=()=>reject(request.error);
  }); } finally { db.close(); }
}
