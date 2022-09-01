# <b><p align="center">反频道马甲 Bot</p></b>

<p align="center">清理群内成员使用频道马甲发送的消息。</p>

<div align="center">
 <img src="https://img.shields.io/github/stars/AnotiaWang/AntiChannelSpammersBot?color=%2326A5E4&logo=GitHub" alt="项目收藏数">
<img src="https://shields.io/endpoint?url=https://acs.bot.ataw.top/stats" alt="统计信息">
</div>

## 特性

- [x] 清理群内成员使用频道马甲发送的消息

- [x] 清理匿名群管发送的消息

- [x] 清理来自关联频道的消息

- [x] 解除频道消息在群内的置顶

- [x] 支持频道马甲白名单

- [x] 支持封禁 / 解封频道马甲

## 使用方法

### 1. 部署至 Heroku

> Heroku 将于 2022/11/28 [下线](https://blog.heroku.com/next-chapter)其免费计划，请自寻其它方式部署。

[![Deploy](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy?template=https://github.com/AnotiaWang/AntiChannelSpammersBot)

### 2. 手动部署

请先安装 Node.js 和 NPM 。

1. Clone 本仓库

2. 复制 `.env.example` 并重命名为 `.env`

3. 编辑 `.env`：

    - `token` : 从 BotFather 拿到的 token

    - `admin` : 你的 UID (Unique Identifier，可使用第三方客户端或 @GetIDsBot 获取)，如果不需要统计功能，可以不配置

    - `webhookUrl` : WebHook 地址。填写完整 URL，**行尾须包含 `/`**（ 如 `https://bot.blabla.com:443/bot` ）。如不使用则留空。

    - `webhookPort`: HTTP 服务器监听的反代端口，如不使用则留空

   > 如使用 WebHook ，支持生成[统计 badge](https://shields.io)，默认的数据接口在 `[域名]/stats` ，样式见代码。图片地址使用 `https://shields.io/endpoint?url=[域名]/stats` 即可。

4. 运行：

   ```bash
   npm install && npm start
   ```

## Demo: [@AntiChannelSpammersBot](https://t.me/AntiChannelSpammersBot)

## License

GPLv3
