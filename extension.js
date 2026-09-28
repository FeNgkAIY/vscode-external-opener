// External Opener：通过 Custom Editor + workbench.editorAssociations 接管“打开文件”，
// 把文件交给外部应用，然后关闭占位标签页。
const vscode = require('vscode');
const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const VIEW_TYPE = 'externalOpener.launcher';
const recent = new Map(); // fsPath -> 时间戳，用于单击预览后又双击时的去重

function cfg() {
  return vscode.workspace.getConfiguration('externalOpener');
}

/** 把本插件配置同步到 workbench.editorAssociations（只增删属于本插件的条目）。 */
async function syncAssociations() {
  const wb = vscode.workspace.getConfiguration('workbench');
  const current = { ...(wb.get('editorAssociations') || {}) };
  const wanted = cfg().get('associations') || {};

  let changed = false;
  for (const [glob, viewType] of Object.entries(current)) {
    if (viewType === VIEW_TYPE && !(glob in wanted)) { delete current[glob]; changed = true; }
  }
  for (const glob of Object.keys(wanted)) {
    if (current[glob] !== VIEW_TYPE) { current[glob] = VIEW_TYPE; changed = true; }
  }
  if (changed) {
    await wb.update('editorAssociations', current, vscode.ConfigurationTarget.Global);
  }
}

/** 按 glob 找到文件对应的外部应用。 */
function findApp(uri) {
  const assoc = cfg().get('associations') || {};
  const name = uri.path.split('/').pop();
  for (const [glob, app] of Object.entries(assoc)) {
    if (globMatch(glob, name) || globMatch(glob, uri.path)) return app;
  }
  return undefined;
}

function globMatch(glob, text) {
  const re = '^' + glob
    .replace(/[.+^$()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/\{([^}]*)\}/g, (_, s) => '(' + s.split(',').join('|') + ')')
    .replace(/\u0000/g, '.*') + '$';
  return new RegExp(re, process.platform === 'win32' ? 'i' : '').test(text);
}

/**
 * 扩展宿主进程带有 ELECTRON_RUN_AS_NODE=1 等变量；若原样传给 Typora、draw.io 等 Electron 应用，
 * 它们会被当成纯 Node 运行并立即退出（实测 Typora 61ms 退出，退出码 1）。
 */
function cleanEnv() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/^ELECTRON_/i.test(key) || /^VSCODE_(IPC_HOOK|PID|CWD|NLS_CONFIG|HANDLES_|CODE_CACHE|ESM_|AMD_|CRASH_REPORTER)/i.test(key)) {
      delete env[key];
    }
  }
  return env;
}

/** 外部程序若在启动后很快以非 0 退出，提示用户，避免静默失败。 */
function watchEarlyExit(child, label) {
  const start = Date.now();
  child.on('exit', (code) => {
    if (code && Date.now() - start < 3000) {
      vscode.window.showErrorMessage(`External Opener：${label} 启动后立即退出（退出码 ${code}）。`);
    }
  });
}

// ---------- 远程文件：下载到本机临时副本，保存时写回 ----------
const mirrors = new Map(); // remoteUri -> { localPath, watcher, lastWritten }

/**
 * 本插件是 UI 扩展，运行在本机。远程窗口中的 uri（vscode-remote://…）的 fsPath
 * 是远程路径，本机应用无法访问；通过 workspace.fs 读取后写到本机临时目录。
 */
async function toLocalPath(uri) {
  if (uri.scheme === 'file') return uri.fsPath;

  const key = uri.toString();
  const existing = mirrors.get(key);
  const hash = crypto.createHash('sha1').update(key).digest('hex').slice(0, 10);
  const dir = path.join(os.tmpdir(), 'vscode-external-opener', hash);
  const localPath = existing ? existing.localPath : path.join(dir, path.posix.basename(uri.path));

  const data = await vscode.workspace.fs.readFile(uri);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(localPath, data);

  if (existing) {
    existing.lastWritten = Buffer.from(data);
    return localPath;
  }
  const entry = { localPath, lastWritten: Buffer.from(data), timer: undefined, watcher: undefined };
  // 监视整个目录：许多编辑器保存时先写临时文件再重命名，直接监视文件会丢失事件。
  entry.watcher = fs.watch(dir, () => {
    clearTimeout(entry.timer);
    entry.timer = setTimeout(() => syncBack(uri, entry), 300);
  });
  mirrors.set(key, entry);
  return localPath;
}

async function syncBack(uri, entry) {
  let data;
  try { data = fs.readFileSync(entry.localPath); } catch (_) { return; }
  if (entry.lastWritten && data.equals(entry.lastWritten)) return;
  try {
    await vscode.workspace.fs.writeFile(uri, data);
    entry.lastWritten = data;
    vscode.window.setStatusBarMessage(`External Opener：已同步回远程 ${path.posix.basename(uri.path)}`, 3000);
  } catch (e) {
    vscode.window.showErrorMessage(`External Opener：写回远程失败：${e.message}`);
  }
}

async function launch(uri) {
  const app = findApp(uri);
  const file = await toLocalPath(uri);
  if (!app || app === 'default') {
    return vscode.env.openExternal(vscode.Uri.file(file)); // 系统默认程序
  }
  if (app.includes('${file}')) {
    const command = app.split('${file}').join(file);
    const child = cp.spawn(command, { shell: true, detached: true, stdio: 'ignore', env: cleanEnv(), windowsHide: true });
    child.on('error', (err) => vscode.window.showErrorMessage(`External Opener 启动失败：${err.message}`));
    watchEarlyExit(child, command);
    child.unref();
    return;
  }
  const child = cp.spawn(app, [file], { detached: true, stdio: 'ignore', env: cleanEnv() });
  watchEarlyExit(child, app);
  child.on('error', (err) => vscode.window.showErrorMessage(`External Opener 启动失败：${err.message}`));
  child.unref();
}

class LauncherProvider {
  openCustomDocument(uri) {
    return { uri, dispose() {} };
  }

  async resolveCustomEditor(document, panel) {
    const { uri } = document;
    const now = Date.now();
    const last = recent.get(uri.fsPath) || 0;
    recent.set(uri.fsPath, now);

    panel.webview.html = `<body style="font-family:sans-serif;padding:1em">已用外部应用打开：${escapeHtml(uri.fsPath)}</body>`;

    if (now - last > 1500) {
      try { await launch(uri); } catch (e) { vscode.window.showErrorMessage(String(e)); }
    }
    if (cfg().get('closeTab')) {
      // 不能直接 panel.dispose()：编辑器尚未挂载完成时销毁 webview 会报
      // "OverlayWebview has been disposed"。改为通过 Tab API 正常关闭标签页。
      closeLauncherTab(uri, 0);
    }
  }
}

function closeLauncherTab(uri, attempt) {
  setTimeout(async () => {
    const target = uri.toString();
    const tabs = [];
    for (const group of vscode.window.tabGroups.all) {
      for (const tab of group.tabs) {
        const input = tab.input;
        if (input instanceof vscode.TabInputCustom &&
            input.viewType === VIEW_TYPE &&
            input.uri.toString() === target) {
          tabs.push(tab);
        }
      }
    }
    if (tabs.length) {
      try { await vscode.window.tabGroups.close(tabs, true); } catch (_) { /* 已被关闭 */ }
    } else if (attempt < 10) {
      closeLauncherTab(uri, attempt + 1); // 标签页可能还没登记，稍后重试
    }
  }, attempt === 0 ? 150 : 100);
}

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function activate(context) {
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(VIEW_TYPE, new LauncherProvider(), {
      supportsMultipleEditorsPerDocument: true,
    }),
    vscode.commands.registerCommand('externalOpener.syncAssociations', syncAssociations),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('externalOpener.associations')) syncAssociations();
    }),
  );
  syncAssociations();
}

function deactivate() {
  for (const entry of mirrors.values()) entry.watcher && entry.watcher.close();
  mirrors.clear();
}

module.exports = { activate, deactivate };
