import { Telegraf } from "telegraf";
import 'dotenv/config';
// import HttpsProxyAgent from 'https-proxy-agent'; // 如果需代理，导入此包
import {
    GeneralCommands,
    handleMessage,
    handleCallbackQuery,
    log,
    loadBotData,
    initWebhook
} from './handler/index.mjs';

export const { token, admin, webhookUrl, webhookPort } = process.env;
export const bot = new Telegraf(token);


log('开始启动...');
if (webhookUrl) {
    await initWebhook();
} else {
    log('没有设置 Webhook，开始轮询');
}
loadBotData();
bot.start((ctx) => GeneralCommands.start(ctx));
bot.help((ctx) => GeneralCommands.help(ctx));
bot.on('message', (ctx) => handleMessage(ctx));
bot.on('callback_query', (ctx) => handleCallbackQuery(ctx));
bot.catch((err) =>
    log(err.message + '\n' + err.stack)
);
const botName = (await bot.telegram.getMe()).username;
await bot.launch();
log(`${botName} 启动完成`);