import { chatsList, strings, template } from "../src/index.mjs";
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
    }).listen(process.env.PORT || webhookPort || 8888);
}

export function log(text, alert = false) {
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
    }
}

export async function isAdmin(ctx) {
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

export function isGroup(ctx) {
    return ctx.message.chat.type === 'group' || ctx.message.chat.type === 'supergroup';
}

export function isPrivate(ctx) {
    return ctx.message.chat.type === 'private';
}

export function checkChatData(chatId) {
    if (typeof chatsList[chatId] === 'undefined') {
        chatsList[chatId] = deepClone(template);
    }
    else {
        for (let a in template) {
            if (typeof chatsList[chatId][a] === 'undefined') {
                chatsList[chatId][a] = deepClone(template[a]);
            }
        }
    }
}

export function isCommand(text) {
    return text.startsWith('/');
}

export function generateKeyboard(chatId, isWhitelist) {
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
            [{ text: `${strings.deleteAnonymousAdminMsg} ${data.delAnonMsg ? '✅' : '❌'}`, callback_data: 'deleteAnonymousMessage' }],
            [{ text: `${strings.deleteLinkedChannelMsg} ${data.delLinkChanMsg ? '✅' : '❌'}`, callback_data: 'deleteChannelMessage' }],
            [{ text: `${strings.unpinChannelMsg} ${data.unpinChanMsg ? '✅' : '❌'}`, callback_data: 'unpinChannelMessage' }],
            [{ text: `${strings.deleteCommand} ${data.delCmd ? '✅' : '❌'}`, callback_data: 'deleteCommand' }],
            [{ text: strings.channelWhitelist, callback_data: 'whitelist' }],
            [{ text: strings.deleteMsg, callback_data: 'deleteMsg' }],
        ];
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