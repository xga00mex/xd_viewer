import type { DesignDocument } from '../core/model';
import { MAX_FILE_SIZE } from './archive';

export async function importXd(file: File): Promise<DesignDocument> {
  if (file.size>MAX_FILE_SIZE) throw new Error('檔案超過 128 MB 上限。');
  const bytes=await file.arrayBuffer();
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('./worker.ts',import.meta.url),{type:'module'});
    const timeout=setTimeout(()=>{worker.terminate();reject(new Error('解析超過 60 秒。請拆分大型檔案後再試。'));},60000);
    const cleanup=()=>{clearTimeout(timeout);worker.terminate();};
    worker.onmessage=e=>{cleanup();e.data.error?reject(new Error(e.data.error)):resolve(e.data.document);};
    worker.onerror=()=>{cleanup();reject(new Error('解析工作程序發生錯誤。'));};
    worker.postMessage({bytes,name:file.name},[bytes]);
  });
}
