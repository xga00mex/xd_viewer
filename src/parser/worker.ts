import { parseXd } from './xd';
self.onmessage = (event: MessageEvent<{ bytes: ArrayBuffer; name: string }>) => {
  try { self.postMessage({ document: parseXd(new Uint8Array(event.data.bytes),event.data.name) }); }
  catch(error) { self.postMessage({ error: error instanceof Error ? error.message : String(error) }); }
};
