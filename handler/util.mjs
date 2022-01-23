import {chatsList, template} from "../src/index.mjs";
import {bot, webhookPort, webhookUrl} from "../index.js";
import {readFileSync, writeFileSync} from "fs";

export function log(text, ...args) {
    console.log(new Date().toLocaleString('zh-CN') + ': ' + text, ...args);
}

export async function isAdmin(ctx) {
    let msg = ctx.message || ctx.callbackQuery;
    let chatId = (msg.chat || msg.message.chat).id;
    let fromId = msg.from.id;
    let result = await ctx.telegram.getChatMember(chatId, fromId);
    return result.status === 'creator' || result.status === 'administrator' || result.user.username === 'GroupAnonymousBot';
}

export function isGroup(ctx) {
    return ctx.message.chat.type === 'group' || ctx.message.chat.type === 'supergroup';
}

export function isPrivate(ctx) {
    return ctx.message.chat.type === 'private';
}

export function checkChatData(chatId) {
    if (!chatsList[chatId])
        Object.assign(chatsList, {[chatId]: template});
}

export function isCommand(text) {
    return text.startsWith('/');
}

export function generateKeyboard(chatId, isWhitelist) {
    let keyboard = [];
    if (isWhitelist) {
        let whitelist = chatsList[chatId].whitelist || {};
        for (let channel in whitelist)
            keyboard.push([{text: chatsList[chatId].whitelist[channel], callback_data: 'demote_' + channel}]);
        if (!Object.keys(whitelist).length)
            keyboard.push([{text: '（当前无白名单）🔙 返回', callback_data: 'back'}]);
        else
            keyboard.push([{text: '🔙 返回', callback_data: 'back'}]);
    } else {
        keyboard.push([{text: '删除频道马甲消息：' + (chatsList[chatId].del ? '✅' : '❌'), callback_data: 'switch'}]);
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
        keyboard.push([{text: '频道白名单', callback_data: 'whitelist'}]);
        keyboard.push([{text: '删除此消息', callback_data: 'deleteMsg'}]);
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
            if (chatsList[chat].delete)
                activeCount += cb;
        } catch (err) {
            if (err.message.includes('kicked') || err.message.includes('not found') || err.message.includes('upgraded')) {
                log(`Analytics: ${chat} 状态异常，已清除其配置数据`);
                delete chatsList[chat];
                saveData();
            } else if (err.message.includes('429 Too Many Requests'))
                chatIds.push(chat);
        }
    }
    clearInterval(interval);
    return [totalCount, activeCount];
}

export function saveData() {
    writeFileSync('data/chatsList.json', JSON.stringify(chatsList));
}

export function loadBotData() {
    try {
        Object.assign(chatsList, JSON.parse(readFileSync('data/chatsList.json', 'utf-8')));
        log('加载数据成功');
    } catch (err) {
        log(`未发现数据或恢复失败，已重新创建数据，报错信息：${err.message}`);
    }
}

