import 'dotenv/config';
import express from 'express';
import Data from './src/util/data.js';
import { Telegraf } from 'telegraf';
import { telegrafThrottler } from 'telegraf-throttler';
import { log } from './src/util/misc.js';
import { handleMessage } from './src/handler/message.js';
import { handleCallbackQuery } from './src/handler/callback.js';
import Analytics from './src/util/analytics.js';

const throttler = telegrafThrottler();

const { token, admin, webhookUrl, webhookPort } = process.env;
const bot = new Telegraf(token);

log('开始启动...');
Data.load();

bot.on('message', (ctx) => handleMessage(ctx));
bot.on('callback_query', (ctx) => handleCallbackQuery(ctx));
bot.catch((err, ctx) => log(err.stack, true, ctx.message || ctx.callbackQuery));
bot.use(throttler);

if (webhookUrl) {
    const app = express();
    const url = new URL(webhookUrl);
    app.use(await bot.createWebhook({ domain: url.origin, path: url.pathname }));
    app.get('stats', (req, res) => {
        res.end({
            'schemaVersion': 1,
            'label': '使用中群组',
            'message': Analytics.activeGroupsCount().toString() + ' 个',
            'color': '#26A5E4',
            'namedLogo': 'Telegram',
            'style': 'flat'
        });
    });
    app.listen(webhookPort, () => log(`已设置 WebHook, Express 服务器正在监听 ${webhookPort} 端口`));
}
else {
    log('没有设置 Webhook，开始轮询');
    await bot.launch();
}
const botName = (await bot.telegram.getMe()).username;
log(`${botName} 启动完成`);

export { bot, token, admin };
