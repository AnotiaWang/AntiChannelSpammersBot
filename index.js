import {Telegraf} from "telegraf";
import 'dotenv/config';
// import HttpsProxyAgent from 'https-proxy-agent'; // 如果需代理，导入此包
import {GeneralCommands, handleMessage, handleCallbackQuery, log} from './handler/index.mjs';
import {loadBotData} from "./handler/util.mjs";
export const {token, admin, webhookUrl, webhookPort} = process.env;

export const bot = new Telegraf(token);

if(webhookUrl) {
    bot.telegram.setWebhook(webhookUrl)
        .then(() => {
            log('Webhook 设置成功');
        })
        .catch(err => {
            log('Webhook 设置失败', err);
        });
    bot.startWebhook(webhookUrl, null, webhookPort);
}
else {
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
log('启动完成');
await bot.launch();