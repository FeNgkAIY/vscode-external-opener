# External Opener

在 VS Code 资源管理器中点击文件时，用配置绑定的外部应用（Typora、draw.io、系统默认程序等）打开，而不是在 VS Code 标签页中打开。支持 Remote-SSH / WSL 远程窗口。

## 安装

从 [Releases](../../releases) 下载最新的 `external-opener-x.y.z.vsix`，然后执行：

```powershell
code --install-extension external-opener-x.y.z.vsix
```

## 配置（settings.json）

```jsonc
"externalOpener.associations": {
  "*.md": "D:/software/Typora/Typora.exe",                  // 可执行文件，文件路径作为参数
  "*.pdf": "default",                                        // 系统默认程序
  "*.{png,jpg}": "C:/Program Files/IrfanView/i_view64.exe",  // 多扩展名
  "*.docx": "\"C:/Program Files/LibreOffice/program/soffice.exe\" --writer \"${file}\"" // 命令模板
},
"externalOpener.closeTab": true
```

- 路径使用 `/` 或 `\\`，不要写单个 `\`。
- 修改后自动同步到 `workbench.editorAssociations`；也可运行命令 **External Opener: 同步文件关联**。
- 需要在 VS Code 中查看源码时：右键 → Open With… → Text Editor。

## 原理

VS Code 不开放拦截资源管理器点击的 API，本插件接管“打开”这一步：

1. 注册 Custom Editor `externalOpener.launcher`（`filenamePattern: "*"`，`priority: "option"`，默认不抢占任何文件）。
2. 把配置中的 glob 写入用户级 `workbench.editorAssociations`，指向该编辑器。
3. 编辑器解析时启动外部应用，再通过 Tab API 关闭占位标签页（不能直接 `panel.dispose()`，否则会报 `OverlayWebview has been disposed`）。
4. 1.5 秒内同一文件只启动一次，避免单击预览后又双击导致重复启动。

## 远程窗口

插件是 UI 扩展，运行在本机。远程文件会通过 `workspace.fs` 下载到 `%TEMP%/vscode-external-opener/<hash>/`，再用本机应用打开；在外部应用中保存后自动写回远程（状态栏提示）。

限制：只复制单个文件，Markdown 中相对路径引用的图片等关联资源不会一起下载；重新点击会用远程最新内容覆盖本地副本。

## 已知坑

- 扩展宿主带有 `ELECTRON_RUN_AS_NODE=1`，直接传给 Typora、draw.io 等 Electron 应用会导致其立即退出；`cleanEnv()` 已清理。
- 同一文件若已以文本标签页打开，再次点击会切到已有标签页，不会触发外部应用。
- 卸载插件后，`workbench.editorAssociations` 中残留的 `externalOpener.launcher` 条目需要手动删除。

## 开发与发布

```bash
npm install
npx vsce package          # 本地打包
git tag v0.1.1 && git push origin v0.1.1   # 推送 tag 后 GitHub Actions 自动打包并创建 Release
```

发布前记得同步修改 `package.json` 中的 `version`，与 tag 保持一致。
