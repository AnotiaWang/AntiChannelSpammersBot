import { api, InputFile } from 'sdk';
import { ADMIN_ID, COMMAND_DELETE_DELAY, NOTICE_DELETE_DELAY } from './config.js';
import strings from './strings.js';
import { addToWhitelist, getCounts, removeFromWhitelist, setSetting } from './store.js';
import { generateKeyboard } from './keyboard.js';
import { countMembers, resetMemberStats } from './stats.js';
import { exportChatsList, importChatsList } from './transfer.js';
import {
    alert, decodeUtf8, deleteLater, deleteMessage, encodeUtf8, errorText, getMe, isAdmin, isGroup, log, reply
} from './telegram.js';

// 解析消息（或文件说明文字）开头的命令，不是命令时返回 null
export function parseCommand(msg) {
    const text = msg.text ?? msg.caption;
    const entities = msg.text != null ? msg.entities : msg.caption_entities;
    if (!text || !text.startsWith('/')) return null;
    if (entities?.length && entities[0].offset === 0 && entities[0].type === 'code') return null;
    const [head, ...args] = text.trim().split(/\s+/);
    const [name, mention] = head.slice(1).split('@');
    return { name, mention, args };
}

// 发送提示，并在稍后自动删除
async function notice(chatId, text) {
    await deleteLater(await reply(chatId, text), NOTICE_DELETE_DELAY);
}

// chat 为群组设置，私聊时为 null
export async function handleCommand(msg, cmd, chat) {
    const chatId = msg.chat.id;
    if (isGroup(msg.chat)) {
        if (chat.delCmd) await deleteLater(msg, COMMAND_DELETE_DELAY);
        // @ 的不是自己，则不理会
        if (cmd.mention && cmd.mention.toLowerCase() !== (await getMe()).username.toLowerCase()) return;
        if (Object.hasOwn(GeneralCommands, cmd.name)) {
            await GeneralCommands[cmd.name](msg, cmd, chat);
        }
        else if (Object.hasOwn(GroupCommands, cmd.name)) {
            if (await isAdmin(chatId, msg.from)) {
                await GroupCommands[cmd.name](msg, cmd, chat);
            }
            else await notice(chatId, strings.operator_not_admin(msg.from.id));
        }
    }
    else if (msg.chat.type === 'private') {
        if (Object.hasOwn(GeneralCommands, cmd.name)) {
            await GeneralCommands[cmd.name](msg, cmd, chat);
        }
        else if (ADMIN_ID && msg.from.id === ADMIN_ID && Object.hasOwn(OwnerCommands, cmd.name)) {
            await OwnerCommands[cmd.name](msg, cmd);
        }
    }
}

// 从回复的消息或命令参数中取得目标频道，失败时提示并返回 null
async function getQueryChannel(msg, cmd) {
    const chatId = msg.chat.id;
    const replied = msg.reply_to_message;
    if (replied) {
        if (replied.sender_chat?.type !== 'channel') {
            await notice(chatId, strings.x_not_a_channel);
            return null;
        }
        return { id: replied.sender_chat.id, title: replied.sender_chat.title ?? '' };
    }
    const query = cmd.args[0];
    if (!query) {
        await notice(chatId, strings.command_usage_error);
        return null;
    }
    try {
        const target = await api.getChat({ chat_id: query });
        if (target.type === 'channel') return { id: target.id, title: target.title ?? '' };
        await notice(chatId, strings.x_not_a_channel);
    }
    catch (e) {
        await notice(chatId, strings.get_channel_error(errorText(e)));
    }
    return null;
}

const GroupCommands = {
    async on(msg) {
        await setSetting(msg.chat.id, 'del', true);
        await reply(msg.chat.id, strings.del_channel_message_on);
    },

    async off(msg) {
        await setSetting(msg.chat.id, 'del', false);
        await reply(msg.chat.id, strings.del_channel_message_off);
    },

    async promote(msg, cmd) {
        const chatId = msg.chat.id;
        const channel = await getQueryChannel(msg, cmd);
        if (!channel) return;
        if (await addToWhitelist(chatId, channel.id, channel.title)) {
            await notice(chatId, strings.x_added_to_whitelist(channel.title, channel.id));
            log(`Chat ${chatId}: 白名单添加 ${channel.id}`);
        }
        else await notice(chatId, strings.x_already_in_whitelist);
    },

    async demote(msg, cmd) {
        const chatId = msg.chat.id;
        const channel = await getQueryChannel(msg, cmd);
        if (!channel) return;
        const title = await removeFromWhitelist(chatId, channel.id);
        if (title !== null) {
            await notice(chatId, strings.x_removed_from_whitelist(title || channel.title, channel.id));
            log(`Chat ${chatId}: 白名单删除 ${channel.id}`);
        }
        else await notice(chatId, strings.x_not_in_whitelist);
    },

    async ban(msg, cmd) {
        const chatId = msg.chat.id;
        const channel = await getQueryChannel(msg, cmd);
        if (!channel) return;
        try {
            await api.banChatSenderChat({ chat_id: chatId, sender_chat_id: channel.id });
            await notice(chatId, strings.ban_sender_chat_success(channel.id));
            log(`Chat ${chatId}: 封禁了 ${channel.id}`);
        }
        catch (e) {
            await notice(chatId, strings.permission_error(strings.ban_sender_chat));
        }
    },

    async unban(msg, cmd) {
        const chatId = msg.chat.id;
        const channel = await getQueryChannel(msg, cmd);
        if (!channel) return;
        try {
            await api.unbanChatSenderChat({ chat_id: chatId, sender_chat_id: channel.id });
            await notice(chatId, strings.unban_sender_chat_success(channel.id));
            log(`Chat ${chatId}: 解封了 ${channel.id}`);
        }
        catch (e) {
            await notice(chatId, strings.permission_error(strings.unban_sender_chat));
        }
    },

    async config(msg, cmd, chat) {
        await reply(msg.chat.id, strings.settings, {
            reply_markup: { inline_keyboard: await generateKeyboard(chat) }
        });
    }
};

const GeneralCommands = {
    async start(msg) {
        if (msg.chat.type === 'private') {
            const me = await getMe();
            await reply(msg.chat.id, strings.welcome_private, {
                reply_markup: {
                    inline_keyboard: [[{ text: strings.add_to_group, url: `https://t.me/${me.username}?startgroup=start` }]]
                }
            });
        }
        else await reply(msg.chat.id, strings.welcome_group);
        await deleteMessage(msg, false);
    },

    async help(msg) {
        const extra = isGroup(msg.chat)
            ? { reply_markup: { inline_keyboard: [[{ text: strings.deleteMsg, callback_data: 'deleteMsg' }]] } }
            : {};
        await reply(msg.chat.id, strings.help, extra);
        await deleteMessage(msg, false);
    }
};

const OwnerCommands = {
    // /stats：数据库统计；/stats members：统计成员数（可分多次完成）；/stats reset：重新开始成员统计
    async stats(msg, cmd) {
        const chatId = msg.chat.id;
        const mode = cmd.args[0];
        if (mode === 'reset') {
            await resetMemberStats();
            await reply(chatId, strings.settings_saved);
        }
        else if (mode === 'members') {
            const progress = await reply(chatId, strings.analyzing);
            const result = await countMembers();
            const text = result.done
                ? strings.stats_members(result)
                : strings.stats_members_progress(result.scanned, result.total);
            if (progress) {
                await api.editMessageText({ chat_id: chatId, message_id: progress.message_id, text, parse_mode: 'HTML' });
            }
            log(`Analytics: 已统计 ${result.scanned} / ${result.total}`);
        }
        else await reply(chatId, strings.stats(await getCounts()));
    },

    // 导出为 chatsList.json，格式与旧版相同
    async backup(msg) {
        try {
            const json = await exportChatsList();
            await api.sendDocument({
                chat_id: msg.chat.id,
                document: new InputFile(encodeUtf8(json), 'chatsList.json', { type: 'application/json' }),
                caption: strings.backup_caption,
                disable_notification: true
            });
        }
        catch (e) {
            await alert(`备份失败: ${errorText(e)}`);
        }
    },

    // 发送 chatsList.json 并附上说明文字 /import，或回复该文件 /import
    async import(msg) {
        const document = msg.document ?? msg.reply_to_message?.document;
        if (!document) {
            await reply(msg.chat.id, strings.import_usage);
            return;
        }
        try {
            const bytes = await api.getFileContent(document.file_id);
            const result = await importChatsList(decodeUtf8(bytes));
            await reply(msg.chat.id, strings.import_success(result));
            log(`Data: 已导入 ${result.chats} 个群组，${result.whitelist} 条白名单`);
        }
        catch (e) {
            await reply(msg.chat.id, strings.import_failed(errorText(e)));
        }
    }
};
