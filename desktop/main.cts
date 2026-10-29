import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  net,
  protocol,
  session,
  type IpcMainInvokeEvent,
  type MenuItemConstructorOptions,
} from 'electron';
import { readFile, writeFile, stat, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import {
  APP_URL,
  assetPath,
  safeSaveName,
  trustedRenderer,
  validateWorkspace,
} from './security.cjs';

app.setName('XV');
app.setAppUserModelId('studio.xv.desktop');
app.setPath('userData', path.join(app.getPath('appData'), 'XV'));
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'xv',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);
const selfTest = process.argv.includes('--self-test');
const reportArgument = process.argv.find((arg) => arg.startsWith('--diagnostic-report='));
const reportPath = reportArgument?.slice('--diagnostic-report='.length);
if (selfTest && reportPath)
  app.setPath('userData', path.join(path.dirname(reportPath), 'self-test-profile'));
let window: BrowserWindow | undefined;
const root = path.join(__dirname, '../dist');
const mime: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};
const extensions = {
  design: ['xd', 'xv', 'xdlocal', 'json'],
  font: ['woff2', 'woff', 'ttf', 'otf'],
};
let startupPath = process.argv.find(
  (arg) => !arg.startsWith('-') && /\.(xd|xv|xdlocal)$/i.test(arg)
);
let writes: Promise<unknown> = Promise.resolve();
function authorize(event: IpcMainInvokeEvent) {
  if (
    !window ||
    event.sender !== window.webContents ||
    event.senderFrame !== window.webContents.mainFrame ||
    !trustedRenderer(event.senderFrame.url)
  )
    throw new Error('此畫面無法存取本機檔案');
}
async function readSelectedFile(file: string, limit = 128 * 1024 * 1024) {
  if ((await stat(file)).size > limit) throw new Error(`檔案超過 ${limit / 1024 / 1024} MB`);
  const data = await readFile(file);
  return { name: path.basename(file), bytes: new Uint8Array(data).buffer };
}
function send(action: string) {
  window?.webContents.send('menu:action', action);
}
function buildMenu() {
  const template: MenuItemConstructorOptions[] = [
    {
      label: '檔案',
      submenu: [
        { label: '開啟 XD／工作檔…', accelerator: 'CmdOrCtrl+O', click: () => send('open') },
        { label: '儲存工作檔…', accelerator: 'CmdOrCtrl+S', click: () => send('save') },
        { label: '匯出 HTML 檢視…', accelerator: 'CmdOrCtrl+E', click: () => send('export') },
        { type: 'separator' },
        { label: '結束', role: 'quit' },
      ],
    },
    {
      label: '編輯',
      submenu: [
        { label: '復原設定', accelerator: 'CmdOrCtrl+Z', click: () => send('undo') },
        { label: '重做設定', accelerator: 'CmdOrCtrl+Shift+Z', click: () => send('redo') },
        { type: 'separator' },
        { label: '剪下', role: 'cut' },
        { label: '複製', role: 'copy' },
        { label: '貼上', role: 'paste' },
        { label: '全選', role: 'selectAll' },
      ],
    },
    {
      label: '檢視',
      submenu: [
        { label: '設計稿', click: () => send('design') },
        { label: '互動預覽', click: () => send('preview') },
        { label: '符合視窗', click: () => send('fit') },
        { label: '全螢幕', role: 'togglefullscreen' },
      ],
    },
    {
      label: '說明',
      submenu: [
        { label: '使用說明', click: () => send('help') },
        { label: '匯入相容性', click: () => send('diagnostics') },
        { label: '管理本機字型', click: () => send('fonts') },
        { type: 'separator' },
        {
          label: '關於 XV',
          click: () => {
            void dialog.showMessageBox(window!, {
              type: 'info',
              title: 'XV',
              message: `XV ${app.getVersion()}`,
              detail:
                '本機 XD 設計稿檢視與切版工具\n不需要瀏覽器或 Adobe XD。匯出 HTML 可供瀏覽器檢視。',
            });
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
function registerIpc() {
  ipcMain.handle('window:close', async (event) => {
    authorize(event);
    await writes;
    window?.destroy();
  });
  ipcMain.handle('file:open', async (event, kind: unknown) => {
    authorize(event);
    if (kind !== 'design' && kind !== 'font') throw new Error('無效檔案類別');
    const result = await dialog.showOpenDialog(window!, {
      title: kind === 'design' ? '開啟設計稿或工作檔' : '載入本機字型',
      properties: ['openFile'],
      filters: [
        { name: kind === 'design' ? 'XD 設計稿與工作檔' : '字型', extensions: extensions[kind] },
      ],
    });
    return result.canceled
      ? null
      : readSelectedFile(
          result.filePaths[0],
          kind === 'font' ? 20 * 1024 * 1024 : 128 * 1024 * 1024
        );
  });
  ipcMain.handle('file:startup', async (event) => {
    authorize(event);
    const file = startupPath;
    startupPath = undefined;
    return file ? readSelectedFile(file) : null;
  });
  ipcMain.handle('file:save', async (event, name: unknown, bytes: unknown) => {
    authorize(event);
    if (!(bytes instanceof ArrayBuffer) || bytes.byteLength > 256 * 1024 * 1024)
      throw new Error('匯出資料過大或無效');
    const suggested = safeSaveName(name),
      extension = path.extname(suggested).slice(1);
    const result = await dialog.showSaveDialog(window!, {
      title: '匯出檔案',
      defaultPath: suggested,
      filters: extension ? [{ name: extension.toUpperCase(), extensions: [extension] }] : [],
    });
    if (result.canceled || !result.filePath) return false;
    await writeFile(result.filePath, Buffer.from(bytes));
    return true;
  });
  ipcMain.handle('workspace:read', async (event) => {
    authorize(event);
    const file = path.join(app.getPath('userData'), 'workspace.json');
    try {
      if ((await stat(file)).size > 180 * 1024 * 1024) throw new Error('工作檔過大');
      return await readFile(file, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // Read the former product's workspace once; subsequent saves use XV.
        const legacy = path.join(app.getPath('appData'), 'XD Local', 'workspace.json');
        try {
          if ((await stat(legacy)).size > 180 * 1024 * 1024) throw new Error('工作檔過大');
          return await readFile(legacy, 'utf8');
        } catch (legacyError) {
          if ((legacyError as NodeJS.ErrnoException).code === 'ENOENT') return null;
          throw legacyError;
        }
      }
      throw error;
    }
  });
  ipcMain.handle('workspace:write', async (event, json: unknown) => {
    authorize(event);
    validateWorkspace(json);
    const next = writes
      .catch(() => {})
      .then(async () => {
        const folder = app.getPath('userData');
        await mkdir(folder, { recursive: true });
        await writeFile(path.join(folder, 'workspace.tmp'), json, 'utf8');
        await rename(path.join(folder, 'workspace.tmp'), path.join(folder, 'workspace.json'));
      });
    writes = next;
    await next;
  });
}
if (!selfTest && !app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', (_event, args) => {
    startupPath = args.find((arg) => /\.(xd|xdlocal)$/i.test(arg));
    if (window) {
      if (window.isMinimized()) window.restore();
      window.focus();
      if (startupPath) send('startup');
    }
  });
  app
    .whenReady()
    .then(async () => {
      protocol.handle('xv', async (request) => {
        if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405 });
        const file = assetPath(root, request.url);
        if (!file) return new Response(null, { status: 403 });
        try {
          const data = await readFile(file);
          return new Response(request.method === 'HEAD' ? null : new Uint8Array(data), {
            headers: {
              'Content-Type': mime[path.extname(file)] ?? 'application/octet-stream',
              'X-Content-Type-Options': 'nosniff',
            },
          });
        } catch {
          return new Response(null, { status: 404 });
        }
      });
      session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) =>
        callback(false)
      );
      session.defaultSession.webRequest.onBeforeRequest(
        { urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] },
        (_details, callback) => callback({ cancel: true })
      );
      if (selfTest) {
        try {
          const response = await net.fetch(APP_URL),
            html = await response.text();
          if (response.status !== 200 || !html.includes('XV'))
            throw new Error('主程式資源檢查失敗');
          const refs = [...html.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)].map(
            (match) => match[1]
          );
          for (const ref of refs) {
            if ((await net.fetch('xv://app' + ref)).status !== 200)
              throw new Error('無法載入 ' + ref);
          }
          await readFile(path.join(__dirname, 'preload.cjs'));
          if (!reportPath) throw new Error('請指定 --diagnostic-report');
          await mkdir(path.dirname(reportPath), { recursive: true });
          await writeFile(
            reportPath,
            JSON.stringify(
              {
                ok: true,
                version: app.getVersion(),
                electron: process.versions.electron,
                packaged: app.isPackaged,
                assets: refs.length,
                protocol: 'xv',
                guiAutomation: false,
              },
              null,
              2
            )
          );
          app.exit(0);
        } catch (error) {
          if (reportPath)
            await writeFile(reportPath, JSON.stringify({ ok: false, error: String(error) }));
          app.exit(1);
        }
        return;
      }
      registerIpc();
      buildMenu();
      window = new BrowserWindow({
        width: 1440,
        height: 960,
        minWidth: 980,
        minHeight: 640,
        show: false,
        title: 'XV',
        backgroundColor: '#17191c',
        webPreferences: {
          preload: path.join(__dirname, 'preload.cjs'),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          webSecurity: true,
        },
      });
      window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      window.webContents.on('will-navigate', (event, url) => {
        if (!trustedRenderer(url)) event.preventDefault();
      });
      window.once('ready-to-show', () => window?.show());
      window.on('close', (event) => {
        event.preventDefault();
        send('app-close');
      });
      window.on('closed', () => {
        window = undefined;
      });
      await window.loadURL(APP_URL);
    })
    .catch((error) => {
      console.error(error);
      app.exit(1);
    });
}
app.on('window-all-closed', () => {
  void writes.finally(() => app.quit());
});
