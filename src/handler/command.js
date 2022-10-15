import { ChatType, generateKeyboard, isAdmin, log } from '../util/misc.js';
import Data, { chatsList } from '../util/data.js';
import { deleteMessage, getQueryChatId } from './message.js';
import { admin } from '../../index.js';
import strings from '../strings/index.js';
import Analytics from '../util/analytics.js';

export async function handleCommand(ctx) {
    const chatId = ctx.chat.id, fromId = ctx.from.id, chatType = new ChatType(ctx);
    const msg = ctx.message, text = msg.text || msg.caption;
    let [command] = text.split(' ');
    let mention = command.split('@')[1];

    command = command.split('@')[0].slice(1);

    if (command.includes('constructor') || command.includes('prototype')) return;

    if (chatType.isGroup()) {
        if (chatsList[chatId].delCmd) {
            deleteMessage(msg, false, 10000).catch(() => null);
        }
        // 如果消息文本中包含 @，且不是 @ 自己，则不理会
        if (mention && mention !== ctx.me) return;
        if (typeof GeneralCommands[command] === 'function') {
            await GeneralCommands[command](ctx);
        }
        else if (typeof GroupCommands[command] === 'function') {
            if (await isAdmin(ctx)) {
                GroupCommands[command](ctx);
            }
            else {
                const cb = await ctx.reply(strings.operator_not_admin(msg.from.id));
                await deleteMessage(cb, false, 15000);
            }
        }
    }
    else if (chatType.isPrivate()) {
        if (typeof GeneralCommands[command] === 'function') {
            await GeneralCommands[command](ctx);
        }
        else if (fromId.toString() === admin && OwnerCommands.hasOwnProperty(command)) {
            OwnerCommands[command](ctx);
        }
    }
}

class GroupCommands {
    static on(ctx) {
        chatsList[ctx.message.chat.id].del = true;
        ctx.reply(strings.del_channel_message_on).catch((e) => log(`${ctx.message.chat.id}: 发送消息失败：${e.message}`));
    }

    static off(ctx) {
        chatsList[ctx.message.chat.id].del = false;
        ctx.reply(strings.del_channel_message_off).catch((e) => log(`${ctx.message.chat.id}: 发送消息失败：${e.message}`));
    }

    static async promote(ctx) {
        let chatId = ctx.message.chat.id, cb;
        let targetChatId = await getQueryChatId(ctx);
        if (!targetChatId)
            return;
        if (chatsList[chatId].whitelist[targetChatId[0]]) {
            cb = await ctx.reply(strings.x_already_in_whitelist)
                          .catch((e) => log(`${ctx.message.chat.id}: 发送消息失败：${e.message}`));
        }
        else {
            chatsList[chatId].whitelist[targetChatId[0]] = targetChatId[1];
            cb = await ctx.reply(strings.x_added_to_whitelist(targetChatId[1], targetChatId[0]))
                          .catch((e) => log(`${ctx.message.chat.id}: 发送消息失败：${e.message}`));
        }
        log(`Chat ${chatId}: 白名单添加 ${targetChatId[0]}`);
        await deleteMessage(cb, false, 15000);
    }

    static async demote(ctx) {
        let chatId = ctx.message.chat.id, cb;
        let targetChatId = await getQueryChatId(ctx);
        if (!targetChatId)
            return;
        if (chatsList[chatId].whitelist[targetChatId[0]]) {
            delete chatsList[chatId].whitelist[targetChatId[0]];
            cb = await ctx.reply(strings.x_removed_from_whitelist(targetChatId[1], targetChatId[0]))
                          .catch((e) => log(`${ctx.message.chat.id}: 发送消息失败：${e.message}`));
        }
        else {
            cb = await ctx.reply(strings.x_not_in_whitelist)
                          .catch((e) => log(`${ctx.message.chat.id}: 发送消息失败：${e.message}`));
        }
        log(`Chat ${chatId}: 白名单删除 ${targetChatId[0]}`);
        await deleteMessage(cb, false, 15000);
    }

    static async ban(ctx) {
        let chatId = ctx.message.chat.id, cb;
        let targetChatId = await getQueryChatId(ctx);
        if (!targetChatId)
            return;
        try {
            await ctx.telegram.banChatSenderChat(chatId, targetChatId[0]);
            cb = await ctx.reply(strings.ban_sender_chat_success(targetChatId[0]));
        }
        catch (e) {
            cb = await ctx.reply(strings.permission_error(strings.ban_sender_chat))
                          .catch((e) => log(`${ctx.message.chat.id}: 发送消息失败：${e.message}`));
        }
        log(`Chat ${chatId}: 封禁了 ${targetChatId[0]}`);
        await deleteMessage(cb, false, 15000);
    }

    static async unban(ctx) {
        let chatId = ctx.message.chat.id, cb;
        let targetChatId = await getQueryChatId(ctx);
        if (!targetChatId)
            return;
        try {
            await ctx.telegram.unbanChatSenderChat(chatId, targetChatId[0]);
            cb = await ctx.reply(strings.unban_sender_chat_success(targetChatId[0]));
        }
        catch (e) {
            cb = await ctx.reply(strings.permission_error(strings.unban_sender_chat))
                          .catch((e) => log(`${ctx.message.chat.id}: 发送消息失败：${e.message}`));
        }
        log(`Chat ${chatId}: 解封了 ${targetChatId[0]}`);
        await deleteMessage(cb, false, 15000);
    }

    static config(ctx) {
        ctx.reply(strings.settings, {
            reply_markup: {
                inline_keyboard: generateKeyboard(ctx.message.chat.id)
            }
        }).catch((e) => log(`${ctx.message.chat.id}: 发送消息失败：${e.message}`));
    }
}

export class GeneralCommands {
    static async start(ctx) {
        try {
            if (new ChatType(ctx).isPrivate())
                await ctx.reply(strings.welcome_private, {
                    reply_markup: {
                        inline_keyboard: [[{
                            text: strings.add_to_group,
                            url: `https://t.me/${ctx.me}?startgroup=start`
                        }]]
                    },
                    disable_web_page_preview: true
                });
            else if (new ChatType(ctx).isGroup())
                await ctx.reply(strings.welcome_group, { disable_web_page_preview: true });
            await deleteMessage(ctx.message, false);
        }
        catch (e) {
        }
    }

    static async help(ctx) {
        const chatType = new ChatType(ctx);
        try {
            if (chatType.isPrivate())
                await ctx.reply(strings.help, { disable_web_page_preview: true });
            else if (chatType.isGroup())
                await ctx.reply(strings.help, {
                    disable_web_page_preview: true,
                    reply_markup: {
                        inline_keyboard: [[{ text: strings.deleteMsg, callback_data: 'deleteMsg' }]]
                    }
                });
            await deleteMessage(ctx.message, false);
        }
        catch (e) {
        }
    }

    static async apply() {
    }
}

class OwnerCommands {
    static async stats(ctx) {
        log(`Analytics: 开始统计...`);
        let editMsg = await ctx.reply(strings.analyzing);
        const result = await Analytics.chatMembersCount(editMsg);
        await ctx.telegram.editMessageText(editMsg.chat.id,
            editMsg.message_id,
            undefined,
            strings.stats(
                {
                    joinedGroups: Object.keys(chatsList).length.toString(),
                    joinedMembers: result[0].toString(),
                    enabledGroups: Analytics.activeGroupsCount().toString(),
                    enabledMembers: result[1].toString()
                }
            )
        );
        log(`Analytics: 统计完成`);
    }

    static save(ctx) {
        Data.save();
        ctx.reply(strings.save_success);
        log(`Data: 已备份数据`);
    }

    static exit(ctx) {
        let confirm = ctx.message.text.split(' ')[1];
        if (confirm && (confirm.toLowerCase() === 'yes' || confirm.toLowerCase() === 'y')) {
            log(`Owner: 已退出`);
            ctx.stop('Owner exit');
        }
        else {
            ctx.reply(strings.exit_confirm).catch(() => null);
        }
    }

    static backup(ctx) {
        ctx.reply('正在备份...');
        Data.save();
        Data.backup();
    }
}
