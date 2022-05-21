import { chatsList, template } from "../src/index.mjs";
import { admin, bot, webhookPort, webhookUrl } from "../index.js";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { createServer } from "http";

export async function initWebhook() {
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
                "message": getActiveGroupsCount().toString() + ' 个',
                "color": "#26A5E4",
                "namedLogo": "Telegram",
                "style": "flat"
            }));
            res.end();
        } else if (req.url === webhookPath) {
            bot.handleUpdate(req.body, res).catch(err => {
                log(`Update 处理失败: 消息：${req.body}，错误信息：${err.stack}`);
            });
        } else {
            res.statusCode = 404;
            res.end('Not found');
        }
    }).listen(webhookPort);
}

export function log(text, alert = false) {
    let time = new Date().toLocaleString('zh-CN', { hour12: false });
    console.log(time + ': ' + text);
    if (!existsSync('./log')) {
        mkdirSync('./log');
    }
    writeFileSync('./log/log.txt', time + ': ' + text + '\n', { flag: 'a' });
    if (alert) {
        bot.telegram.sendMessage(admin, text).catch(err => {
            log(`消息发送失败: ${err.message}`);
        });
    }
}

export async function isAdmin(ctx) {
    const msg = ctx.message || ctx.callbackQuery;
    const chatId = (msg.chat || msg.message.chat).id;
    const fromId = msg.from.id;
    const result = await ctx.telegram.getChatMember(chatId, fromId);
    return result.status === 'creator' || result.status === 'administrator' || result.user.username === 'GroupAnonymousBot';
}

export function isGroup(ctx) {
    return ctx.message.chat.type === 'group' || ctx.message.chat.type === 'supergroup';
}

export function isPrivate(ctx) {
    return ctx.message.chat.type === 'private';
}

export function checkChatData(chatId) {
    if (!chatsList[chatId]) {
        chatsList[chatId] = deepClone(template);
    }
    else {
        for (let a in template) {
            if (!chatsList[chatId][a])
                chatsList[chatId][a] = deepClone(template[a]);
        }
    }
}

export function isCommand(text) {
    return text.startsWith('/');
}

export function generateKeyboard(chatId, isWhitelist) {
    let keyboard = [];
    if (isWhitelist) {
        let whitelist = chatsList[chatId].whitelist || {};
        for (let channel in whitelist)
            keyboard.push([{ text: chatsList[chatId].whitelist[channel], callback_data: 'demote_' + channel }]);
        if (!Object.keys(whitelist).length)
            keyboard.push([{ text: '（当前无白名单）🔙 返回', callback_data: 'back' }]);
        else
            keyboard.push([{ text: '🔙 返回', callback_data: 'back' }]);
    } else {
        keyboard.push([{ text: '删除频道马甲消息：' + (chatsList[chatId].del ? '✅' : '❌'), callback_data: 'switch' }]);
        keyboard.push([{
            text: '删除匿名管理消息：' + (chatsList[chatId].delAnonMsg ? '✅' : '❌'),
            callback_data: 'deleteAnonymousMessage'
        }]);
        keyboard.push([{
            text: '删除来自关联频道的消息：' + (chatsList[chatId].delLinkChanMsg ? '✅' : '❌'),
            callback_data: 'deleteChannelMessage'
        }]);
        keyboard.push([{
            text: '解除频道消息在群内置顶：' + (chatsList[chatId].unpinChanMsg ? '✅' : '❌'),
            callback_data: 'unpinChannelMessage'
        }])
        keyboard.push([{ text: '频道白名单', callback_data: 'whitelist' }]);
        keyboard.push([{ text: '删除此消息', callback_data: 'deleteMsg' }]);
    }
    return keyboard;
}

export function getActiveGroupsCount() {
    let count = 0;
    for (let key in chatsList)
        if (chatsList[key].del) count++;
    return count;
}

export async function getChatMembersCount(editMsg) {
    let activeCount = 0, totalCount = 0, i = 0;
    let interval = setInterval(() => {
        bot.telegram.editMessageText(editMsg.chat.id, editMsg.message_id, undefined, '统计中 ' + (i / Object.keys(chatsList).length * 100).toFixed(2) + '% ...').catch(() => {
        });
    }, 3000);
    let chatIds = Object.keys(chatsList);
    while (chatIds.length > 0) {
        let chat = chatIds.shift();
        try {
            let cb = await bot.telegram.getChatMembersCount(chat);
            i++;
            totalCount += cb;
            if (chatsList[chat].del)
                activeCount += cb;
        } catch (err) {
            if (err.message.includes('kicked') ||
                err.message.includes('not found') ||
                err.message.includes('upgraded') ||
                err.message.includes('deleted')) {
                log(`Analytics: ${chat} 状态异常，已清除其配置数据`);
                delete chatsList[chat];
                saveData();
            } else if (err.message.includes('Too Many Requests'))
                chatIds.push(chat);
        }
    }
    clearInterval(interval);
    return [totalCount, activeCount];
}

export function saveData() {
    if (!existsSync('./data'))
        mkdirSync('./data');
    writeFileSync('./data/chatsList.json', JSON.stringify(chatsList));
}

export function loadBotData() {
    try {
        Object.assign(chatsList, JSON.parse(readFileSync('./data/chatsList.json', 'utf-8')));
        log('加载数据成功');
    } catch (err) {
        log(`未发现数据或恢复失败，已重新创建数据，报错信息：${err.message}`);
    }
}

export function backupBotData() {
    bot.telegram.sendDocument(admin, { source: './data/chatsList.json' }, {
        caption: '#backup',
        disable_notification: true
    }).catch((e) => {
        log(`备份失败: ${e.message}`, true);
        bot.telegram.sendMessage(admin, '备份失败:' + e.message).catch(() => null);
    });
}

// https://segmentfault.com/a/1190000018903274
function deepClone(obj) {
    let copy;

    // Handle the 3 simple types, and null or undefined
    if (null == obj || "object" != typeof obj) return obj;

    // Handle Date
    if (obj instanceof Date) {
        copy = new Date();
        copy.setTime(obj.getTime());
        return copy;
    }

    // Handle Array
    if (obj instanceof Array) {
        copy = [];
        for (let i = 0, len = obj.length; i < len; i++) {
            copy[i] = deepClone(obj[i]);
        }
        return copy;
    }

    // Handle Function
    if (obj instanceof Function) {
        copy = function () {
            return obj.apply(this, arguments);
        }
        return copy;
    }

    // Handle Object
    if (obj instanceof Object) {
        copy = {};
        for (let attr in obj) {
            if (obj.hasOwnProperty(attr)) copy[attr] = deepClone(obj[attr]);
        }
        return copy;
    }

    throw new Error("Unable to copy obj as type isn't supported " + obj.constructor.name);
}

setInterval(() => {
    backupBotData();
}, 1000 * 3600);