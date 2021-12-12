# <p align="center">Anti Channel Spammers Bot</p>

<p align="center">清理群内成员使用频道马甲发送的消息。</p>

## 特性

- [x] 清理群内成员使用频道马甲发送的消息

- [x] 可清理匿名群管发送的消息

- [x] 可清理来自关联频道的消息

- [x] 支持白名单功能

## 使用方法

1. Clone 本仓库

2. 配置变量 (`config.json`) ：
	- `token` : 从 BotFather 拿到的 token
	- `admin` : 你的 UID (Unique Identifier，可使用第三方客户端或 @GetIDsBot 获取)，如果不需要统计功能，可以不配置
   - `bot` : 机器人的 username，不含 @ ，如 `AntiChannelSpammersBot`
	- `webhookUrl` : WebHook 地址。建议填写完整 URL，**行尾须包含 `/`**（ 如 `https://bot.blabla.com:443/` ）。如不使用则留空。
   
3. 运行：

   ```bash
   npm install
   node bot.js
   ```

## Demo: [@AntiChannelSpammersBot](https://t.me/AntiChannelSpammersBot)

## License

GPLv3
