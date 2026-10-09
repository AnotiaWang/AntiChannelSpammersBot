# <b><p align="center">反频道马甲 Bot</p></b>

<p align="center">清理群内成员使用频道马甲发送的消息。</p>

<div align="center">
 <img src="https://img.shields.io/github/stars/AnotiaWang/AntiChannelSpammersBot?color=%2326A5E4&logo=GitHub" alt="项目收藏数">
</div>

## 特性

- [x] 清理群内成员使用频道马甲发送的消息

- [x] 清理匿名群管发送的消息

- [x] 清理来自关联频道的消息

- [x] 解除频道消息在群内的置顶

- [x] 支持频道马甲白名单

- [x] 支持封禁 / 解封频道马甲

## 部署

本项目运行在 [Telegram Serverless](https://core.telegram.org/bots/serverless) 上，无需自备服务器。代码位于 `tgcloud/`，数据存放在平台为每个 bot 提供的 SQLite 数据库中。

1. 安装 Node.js（运行测试需要 22.5 及以上版本），执行 `corepack enable` 启用 `package.json` 中指定版本的 pnpm。Clone 本仓库并执行 `pnpm install`。

2. 编辑 `tgcloud/lib/config.js`，将 `ADMIN_ID` 设为你的 UID（可使用 @GetIDsBot 获取）。所有者会收到错误报告，并可使用下方的所有者命令。

3. 在 @BotFather 中打开你的 bot → Serverless，开启 Serverless。

4. 初始化并关联 bot（`init` 只会补充缺失的文件，不会覆盖已有文件）：

   ```bash
   pnpm exec tgcloud init
   pnpm exec tgcloud login   # 输入 BotFather → Serverless → CLI Access 中的 CLI access token
   ```

5. 部署代码并建表：

   ```bash
   pnpm run deploy     # tgcloud push，同时会将 webhook 指向平台
   pnpm run migrate    # tgcloud migrate，创建数据库表
   ```

6. 执行 `pnpm exec tgcloud webhook` 确认 webhook 处于 In sync 状态；如不是，执行 `pnpm exec tgcloud webhook sync`。

## 所有者命令

在私聊中由 `ADMIN_ID` 对应的用户使用：

- `/stats`：群组数量等统计。
- `/stats members`：统计成员数，同时清除机器人已不在其中的群组。进度在同一条消息中每 3 秒更新一次。平台限制单次执行时长，每次最多运行 `STATS_TIME_BUDGET`（`tgcloud/lib/config.js`，默认 10 秒），用完后消息上会出现「继续统计」按钮，点击即在同一条消息中继续。执行被平台中途终止时，再次发送 `/stats members` 会从上次保存的进度继续。
- `/stats reset`：放弃未完成的成员统计。
- `/backup`：导出全部数据为 `chatsList.json`，格式与旧版相同。
- `/import`：发送 `chatsList.json` 文件并附上说明文字 `/import`，或回复该文件发送 `/import`。文件中的群组设置和白名单会覆盖数据库中的对应内容，其他群组不受影响。

## 从旧版（自建服务器）迁移

旧版数据保存在服务器的 `data/chatsList.json` 中，可以直接导入。

1. **先在私聊中给旧版 bot 发送 `/save`。** 旧版中通过 `/on`、`/off`、`/promote`、`/demote` 修改的设置只保存在内存中，不发送 `/save` 就会丢失。
2. 停止旧版进程，取出 `data/chatsList.json`（或发送 `/backup` 让旧版 bot 把文件发给你）。
3. 按上文「部署」完成第 1～6 步。`pnpm run deploy` 之后 bot 即由 Serverless 接管。
4. 私聊新 bot，发送 `chatsList.json` 并附上说明文字 `/import`。
5. 发送 `/stats`，核对群组数量。

从停止旧版到完成导入的这段时间内，bot 会按默认设置（全部关闭）运行，不会删除消息。

如需回滚：在新 bot 上发送 `/backup` 取得最新数据，放到旧版的 `data/chatsList.json`，在 BotFather 中关闭 Serverless 后启动旧版。

## 与旧版的差异

- 平台没有定时器。延迟删除的消息（自动清理的命令、15 秒后删除的提示）会记录到数据库，在之后有新的更新到达时删除，因此在不活跃的群组中可能会晚于预定时间删除。
- 不再每小时自动备份，改为由所有者发送 `/backup`。
- 设置修改立即写入数据库，不再需要 `/save`；`/exit` 已移除。
- 平台不提供公开的 HTTP 接口，统计 badge（`/stats` 接口）已移除。
- 非管理员点击设置按钮时会收到提示。

## 开发

`pnpm test` 使用 `test/fake-sdk` 模拟平台的 `sdk` 模块（数据库由 Node.js 内置的 SQLite 提供），在本地运行测试。

注意 `deploy` 与 pnpm 的内置命令同名，需写成 `pnpm run deploy`，不能简写为 `pnpm deploy`。

测试只能覆盖代码逻辑。平台本身的行为（执行时长上限等）需要部署后实际验证。

## Demo: [@AntiChannelSpammersBot](https://t.me/AntiChannelSpammersBot)

## License

GPLv3
