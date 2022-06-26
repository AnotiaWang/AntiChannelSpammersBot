import Data from "./src/util/data.js";
import 'dotenv/config';
import { Telegraf } from "telegraf";
import { telegrafThrottler } from "telegraf-throttler";
import { initWebhook, log } from "./src/util/misc.js";
import { handleMessage } from "./src/handler/message.js";
import { handleCallbackQuery } from "./src/handler/callback.js";

const throttler = telegrafThrottler();

const { token, admin, webhookUrl, webhookPort } = process.env;
const bot = new Telegraf(token);

log('开始启动...');
if (webhookUrl) {
    await initWebhook();
} else {
    log('没有设置 Webhook，开始轮询');
}
Data.load();

bot.on('message', (ctx) => handleMessage(ctx));
bot.on('callback_query', (ctx) => handleCallbackQuery(ctx));
bot.catch((err) => log(err.stack, true));
bot.use(throttler);
const botName = (await bot.telegram.getMe()).username;
await bot.launch();
log(`${botName} 启动完成`);

export { bot, token, admin, webhookUrl, webhookPort };
