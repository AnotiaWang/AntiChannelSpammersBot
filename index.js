import {Telegraf} from "telegraf";
import 'dotenv/config';
// import HttpsProxyAgent from 'https-proxy-agent'; // 如果需代理，导入此包
import {GeneralCommands, handleMessage, handleCallbackQuery, log, loadBotData} from './handler/index.mjs';

export const {token, admin, webhookUrl, webhookPort} = process.env;
export const bot = new Telegraf(token);

if (webhookUrl) {
    bot.telegram.setWebhook(webhookUrl)
        .then(() => {
            log('Webhook 设置成功');
        })
        .catch(err => {
            log('Webhook 设置失败', err);
        });
    bot.startWebhook(webhookUrl, null, webhookPort);
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
const botInfo = await bot.telegram.getMe();
export const botName = botInfo.username;
await bot.launch();