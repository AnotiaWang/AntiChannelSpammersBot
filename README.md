# <b><p align="center">反频道马甲 Bot</p></b>

<p align="center">清理群内成员使用频道马甲发送的消息。</p>

<div align="center"> 
<img src="https://shields.io/endpoint?url=https://acsbot.anotia.top/stats" alt="统计信息">
 <img src="https://img.shields.io/github/stars/AnotiaWang/AntiChannelSpammersBot?color=%2326A5E4&logo=GitHub" alt="仓库收藏数">
</div>

## 特性

- [x] 清理群内成员使用频道马甲发送的消息

- [x] 清理匿名群管发送的消息

- [x] 清理来自关联频道的消息

- [x] 解除频道消息在群内的置顶

- [x] 支持频道马甲白名单

## 使用方法

1. Clone 本仓库

2. 复制 `.env.example` 并重命名为 `.env`

2. 编辑 `.env`：

	- `token` : 从 BotFather 拿到的 token

	- `admin` : 你的 UID (Unique Identifier，可使用第三方客户端或 @GetIDsBot 获取)，如果不需要统计功能，可以不配置

	- `webhookUrl` : WebHook 地址。填写完整 URL，**行尾须包含 `/`**（ 如 `https://bot.blabla.com:443/bot` ）。如不使用则留空。

    - `webhookPort`: HTTP 服务器监听的端口，如不使用则留空

   > 如使用 WebHook ，支持生成[统计 badge](https://shields.io)，默认的数据接口在 `[域名]/stats` ，样式见代码。图片地址使用 `https://shields.io/endpoint?url=[域名]/stats` 即可。

3. 运行：

   ```bash
   npm install && npm start
   ```

## Demo: [@AntiChannelSpammersBot](https://t.me/AntiChannelSpammersBot)

## License

GPLv3
