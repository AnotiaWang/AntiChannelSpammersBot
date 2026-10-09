// 与旧版 data/chatsList.json 相同格式的导入导出，既用于迁移，也用于备份和回滚
import { SETTING_COLUMNS, allChats, allWhitelist, importChats } from './store.js';

function toId(value) {
    const id = Number(value);
    return Number.isSafeInteger(id) && id !== 0 ? id : null;
}

// 解析 chatsList.json 的内容，缺失的设置按默认值（关闭）处理
export function parseChatsList(text) {
    const data = JSON.parse(text);
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('文件内容不是 chatsList.json 格式的对象');
    }
    const chats = [], entries = [];
    let skipped = 0;
    for (const [key, value] of Object.entries(data)) {
        const chatId = toId(key);
        if (chatId === null || !value || typeof value !== 'object') {
            skipped++;
            continue;
        }
        const chat = { chatId };
        for (const setting in SETTING_COLUMNS) chat[setting] = value[setting] === true;
        chats.push(chat);

        const whitelist = value.whitelist && typeof value.whitelist === 'object' ? value.whitelist : {};
        for (const [channel, title] of Object.entries(whitelist)) {
            const channelId = toId(channel);
            if (channelId === null) {
                skipped++;
                continue;
            }
            entries.push({ chatId, channelId, title: title == null ? '' : String(title) });
        }
    }
    return { chats, entries, skipped };
}

export async function importChatsList(text) {
    const { chats, entries, skipped } = parseChatsList(text);
    await importChats(chats, entries);
    return { chats: chats.length, whitelist: entries.length, skipped };
}

export async function exportChatsList() {
    const data = {};
    for (const chat of await allChats()) {
        const { chatId, ...settings } = chat;
        data[chatId] = { ...settings, whitelist: {} };
    }
    for (const entry of await allWhitelist()) {
        if (data[entry.chatId]) data[entry.chatId].whitelist[entry.channelId] = entry.title;
    }
    return JSON.stringify(data);
}
