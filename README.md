# External Opener

在 VS Code 资源管理器中单击文件时，直接使用你指定的外部应用（如 Typora、draw.io 或系统默认程序）打开，而不是在编辑器标签页中打开。

## 功能

- 按文件名模式（glob）为不同类型的文件绑定不同的外部应用
- 支持系统默认程序、可执行文件路径和自定义命令模板
- 打开后自动关闭 VS Code 中的占位标签页
- 支持 Remote-SSH / WSL 等远程窗口：远程文件会下载到本机临时副本中打开，保存后自动同步回远程

## 安装

1. 从 [Releases](https://github.com/FeNgkAIY/vscode-external-opener/releases) 下载最新的 `external-opener-x.y.z.vsix`。
2. 执行以下命令安装，或在 VS Code 扩展视图中选择 “从 VSIX 安装…”：

   ```powershell
   code --install-extension external-opener-x.y.z.vsix
   ```

3. 重新加载 VS Code 窗口。

## 配置

打开用户设置（`Ctrl+Shift+P` → **Preferences: Open User Settings (JSON)**），添加：

```jsonc
"externalOpener.associations": {
  // 使用可执行文件打开，文件路径作为唯一参数传入
  "*.md": "D:/software/Typora/Typora.exe",

  // 使用系统默认程序打开
  "*.pdf": "default",

  // 一条规则匹配多个扩展名
  "*.{png,jpg,jpeg}": "C:/Program Files/IrfanView/i_view64.exe",

  // 命令模板：${file} 会被替换为文件路径
  "*.docx": "\"C:/Program Files/LibreOffice/program/soffice.exe\" --writer \"${file}\""
},
"externalOpener.closeTab": true
```

| 设置项 | 说明 |
|---|---|
| `externalOpener.associations` | 文件名模式 → 外部应用。值可以是 `"default"`、可执行文件路径，或包含 `${file}` 的命令模板。 |
| `externalOpener.closeTab` | 启动外部应用后是否自动关闭占位标签页，默认 `true`。 |

注意事项：

- JSON 中的 Windows 路径请使用 `/` 或 `\\`。
- 保存设置后，扩展会自动将规则同步到 `workbench.editorAssociations`。如未生效，可运行命令 **External Opener: 同步文件关联**。
- 如需在 VS Code 中编辑某个已绑定的文件，请右键选择 **Open With…** → **Text Editor**。

## 远程窗口

在 Remote-SSH、WSL 等远程窗口中打开文件时，扩展会先将文件复制到本机临时目录（`%TEMP%/vscode-external-opener/`），再用本机应用打开。在外部应用中保存后，改动会自动写回远程，状态栏会显示同步提示。

当前限制：

- 仅复制被打开的单个文件，Markdown 中以相对路径引用的图片等资源不会一并复制。
- 再次打开同一文件时，本地副本会被远程最新内容覆盖；请避免同时在两端编辑。

## 常见问题

**单击文件后没有调用外部应用，而是切换到了一个已有标签页。**
该文件此前已以文本编辑器打开。关闭该标签页后重新单击即可。

**外部应用窗口没有出现在前台。**
Windows 可能会阻止后台启动的程序抢占焦点，请留意任务栏中闪烁的图标。

**卸载扩展后，文件仍无法在 VS Code 中打开。**
请从用户设置的 `workbench.editorAssociations` 中删除值为 `externalOpener.launcher` 的条目。

## 工作原理

VS Code 没有提供拦截资源管理器点击的 API，本扩展通过接管 “打开文件” 实现该功能：

1. 注册一个适用于所有文件、但默认不启用的自定义编辑器 `externalOpener.launcher`。
2. 将配置中的文件名模式写入 `workbench.editorAssociations`，使对应文件默认使用该编辑器打开。
3. 编辑器被调用时启动外部应用，随后关闭占位标签页。

## 参与开发

本地构建、调试与发布流程见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可证

[MIT](LICENSE)
