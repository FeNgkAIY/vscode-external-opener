# 参与开发

## 环境

- Node.js 18 或更高版本
- VS Code 1.75 或更高版本

```bash
git clone https://github.com/FeNgkAIY/vscode-external-opener.git
cd vscode-external-opener
npm install
```

## 目录结构

| 文件 | 说明 |
|---|---|
| `extension.js` | 扩展全部逻辑：文件关联同步、外部应用启动、占位标签页关闭、远程文件同步 |
| `package.json` | 扩展清单：自定义编辑器、命令与配置项 |
| `.github/workflows/release.yml` | 推送版本 tag 后自动打包并创建 Release |

## 调试运行

在扩展开发宿主中加载本地代码：

```bash
code --extensionDevelopmentPath=.
```

也可以在 VS Code 中打开本仓库，按 `F5` 启动调试。

## 本地打包与安装

```bash
npx vsce package
code --install-extension external-opener-x.y.z.vsix --force
```

## 发布新版本

1. 将 `package.json` 中的 `version` 更新为新版本号，例如 `0.1.2`。
2. 在 `CHANGELOG.md` 中补充该版本的变更。
3. 提交后创建并推送同名 tag：

   ```bash
   git commit -am "release: 0.1.2"
   git push
   git tag v0.1.2
   git push origin v0.1.2
   ```

4. GitHub Actions 会自动打包并创建 Release。若 tag 与 `package.json` 中的版本号不一致，工作流会失败。

注意：`git push --follow-tags` 只推送附注标签（`git tag -a`），不会推送上面创建的轻量标签，因此需要显式执行 `git push origin <tag>`。

## 开发注意事项

- **子进程环境变量**：扩展宿主进程带有 `ELECTRON_RUN_AS_NODE=1`。启动外部应用时必须使用 `cleanEnv()` 清理后的环境，否则 Typora、draw.io 等 Electron 应用会立即退出。
- **关闭占位标签页**：应通过 `vscode.window.tabGroups.close` 关闭；在编辑器解析过程中直接调用 `panel.dispose()` 会导致 `OverlayWebview has been disposed` 错误。
- **系统默认程序**：应传入本地路径调用 `start` / `open` / `xdg-open`，不要使用 `vscode.env.openExternal(file URI)`；后者在 Windows 上无法处理包含非 ASCII 字符的路径。
- **远程文件**：扩展以 UI 扩展运行在本机，读写远程文件需要使用 `vscode.workspace.fs`，不能直接使用 `uri.fsPath`。
- **测试路径**：手动验证时，建议使用包含中文和空格的路径。
