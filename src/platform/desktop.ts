export interface NativeFile {
  name: string;
  bytes: ArrayBuffer;
}
export interface DesktopBridge {
  openFile(kind: 'design' | 'font'): Promise<NativeFile | null>;
  startupFile(): Promise<NativeFile | null>;
  saveFile(name: string, bytes: ArrayBuffer): Promise<boolean>;
  readWorkspace(): Promise<string | null>;
  writeWorkspace(json: string): Promise<void>;
  finishClose(): Promise<void>;
  onMenu(listener: (action: string) => void): () => void;
}
declare global {
  interface Window {
    xdDesktop?: DesktopBridge;
  }
}
export const desktop = (): DesktopBridge | undefined =>
  typeof window === 'undefined' ? undefined : window.xdDesktop;
export const nativeFile = (file: NativeFile) => new File([file.bytes], file.name);
