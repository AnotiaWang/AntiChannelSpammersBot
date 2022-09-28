import { admin, bot, webhookPort, webhookUrl } from "../../index.js";
import { createServer } from 'http';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import Data, { chatsList } from "./data.js";
import strings from "../strings/index.js";
import Analytics from "./analytics.js";

async function initWebhook() {
    const webhookPath = new URL(webhookUrl).pathname;
    await bot.telegram.setWebhook(webhookUrl)
             .then(() => {
                 log('Webhook 设置成功');
             })
             .catch((e) => log(`Webhook 设置失败: ${e.message}`));
    createServer((req, res) => {
        if (req.url === '/stats') {
            res.writeHead(200, { 'Content-Type': 'text/html, charset=utf-8' });
            res.write(JSON.stringify({
                "schemaVersion": 1,
                "label": "使用中群组",
                "message": Analytics.activeGroupsCount().toString() + ' 个',
                "color": "#26A5E4",
                "namedLogo": "Telegram",
                "style": "flat"
            }));
            res.end();
        }
        else if (req.url === webhookPath) {
            bot.handleUpdate(req.body, res).catch(err => {
                log(`Update 处理失败: 消息：${req.body}，错误信息：${err.stack}`);
            });
        }
        else {
            res.statusCode = 404;
            res.end('Not found');
        }
    }).listen(process.env.PORT || webhookPort || 8888);
}

function log(text, alert = false, msgContext = null) {
    const time = new Date().toLocaleString('zh-CN', { hour12: false });
    const content = `[${time}]: ${text}`;
    console.log(content);
    if (!existsSync('./log')) {
        mkdirSync('./log');
    }
    writeFileSync('./log/log.txt', `${content}\n`, { flag: 'a' });
    if (alert) {
        bot.telegram.sendMessage(admin, text).catch(err => {
            log(`消息发送失败: ${err.message}`);
        });
        if (typeof msgContext === 'object') {
            const str = JSON.stringify(msgContext, null, 2);
            if (str.length > 4096) {
                const filePath = `./logs/err_${Date.now()}.json`;
                writeFileSync(filePath, str);
                bot.telegram.sendDocument(admin, filePath, {
                    caption: text
                }).catch();
                rmSync(filePath);
            }
            else bot.telegram.sendMessage(admin, str).catch();
        }
    }
}

async function isAdmin(ctx) {
    const update = ctx.message || ctx.callbackQuery;
    const chatId = (update.chat || update.message.chat).id, fromId = update.from.id;
    try {
        const result = await ctx.telegram.getChatMember(chatId, fromId);
        return result.status === 'creator' || result.status === 'administrator' || result.user.username === 'GroupAnonymousBot';
    }
    catch (e) {
        log(`${chatId}: 获取管理员状态失败：${e.message}`, true);
        return false;
    }
}

class ChatType {
    constructor(ctx) {
        this.chatType = ctx.chat.type;
    }

    isGroup() {
        return this.chatType === 'group' || this.chatType === 'supergroup';
    }

    isPrivate() {
        return this.chatType === 'private';
    }
}

function hasCommand(ctx) {
    if (ctx.message.text && ctx.message.text.startsWith('/')) {
        if (Array.isArray(ctx.message.entities) && ctx.message.entities.length) {
            if (ctx.message.entities[0].offset === 0 && ctx.message.entities[0].type === 'code') return false;
        }
        return true;
    }
    return false;
}

function generateKeyboard(chatId, isWhitelist) {
    const data = chatsList[chatId];
    let keyboard = [];
    if (isWhitelist) {
        const whitelist = data.whitelist || {};
        for (let channel in whitelist) {
            keyboard.push([{ text: data.whitelist[channel], callback_data: 'demote_' + channel }]);
        }
        keyboard.push([{ text: `${Object.keys(whitelist).length ? '' : '(空) '}🔙 返回`, callback_data: 'back' }]);
    }
    else {
        keyboard = [
            [{ text: `${strings.deleteChannelSenderMsg} ${data.del ? '✅' : '❌'}`, callback_data: 'switch' }],
            [{
                text: `${strings.deleteAnonymousAdminMsg} ${data.delAnonMsg ? '✅' : '❌'}`,
                callback_data: 'deleteAnonymousMessage'
            }],
            [{
                text: `${strings.deleteLinkedChannelMsg} ${data.delLinkChanMsg ? '✅' : '❌'}`,
                callback_data: 'deleteChannelMessage'
            }],
            [{
                text: `${strings.unpinChannelMsg} ${data.unpinChanMsg ? '✅' : '❌'}`,
                callback_data: 'unpinChannelMessage'
            }],
            [{ text: `${strings.deleteCommand} ${data.delCmd ? '✅' : '❌'}`, callback_data: 'deleteCommand' }],
            [{ text: strings.channelWhitelist, callback_data: 'whitelist' }],
            [{ text: strings.deleteMsg, callback_data: 'deleteMsg' }]
        ];
    }
    return keyboard;
}

setInterval(() => {
    Data.backup();
}, 1000 * 3600);

export { ChatType, log, hasCommand, generateKeyboard, isAdmin, initWebhook };
