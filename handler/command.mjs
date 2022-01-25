import {isAdmin, isGroup, log, deleteMessage, generateKeyboard, getActiveGroupsCount, getChatMembersCount, isPrivate, saveData, getQueryChatId, checkChatData} from "./index.mjs";
import {chatsList, strings} from '../src/index.mjs';
import {admin} from "../index.js";

export async function handleCommand(ctx) {
    let text = ctx.message.text || ctx.message.caption;
    let [command] = text.split(' ');
    command = command.split('@')[0].slice(1);
    if (GroupCommands.hasOwnProperty(command) && isGroup(ctx)) {
        checkChatData(ctx.message.chat.id);
        if (await isAdmin(ctx)) {
            GroupCommands[command](ctx);
        } else {
            let cb = await ctx.replyWithHTML(strings.operator_not_admin.replace('{id}', ctx.message.from.id));
            await deleteMessage(cb, false, 15000);
        }
        await deleteMessage(ctx.message, false);
    } else if (isPrivate(ctx)) {
        if (OwnerCommands.hasOwnProperty(command) && ctx.message.from.id.toString() === admin) {
            OwnerCommands[command](ctx);
        }
    }
}

class GroupCommands {
    static on(ctx) {
        chatsList[ctx.message.chat.id].del = true;
        ctx.reply(strings.del_channel_message_on);
    }

    static off(ctx) {
        chatsList[ctx.message.chat.id].del = false;
        ctx.reply(strings.del_channel_message_off);
    }

    static async promote(ctx) {
        let chatId = ctx.message.chat.id, cb;
        let targetChatId = await getQueryChatId(ctx);
        if (!targetChatId)
            return;
        if (chatsList[chatId].whitelist[targetChatId[0]]) {
            cb = await ctx.reply(strings.x_already_in_whitelist);
        } else {
            chatsList[chatId].whitelist[targetChatId[0]] = targetChatId[1];
            cb = await ctx.reply(strings.x_added_to_whitelist.replace('{id}', targetChatId[0]).replace('{x}', targetChatId[1]));
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
            cb = await ctx.reply(strings.x_removed_from_whitelist.replace('{id}', targetChatId[0]).replace('{x}', targetChatId[1]));
        } else {
            cb = await ctx.reply(strings.x_not_in_whitelist);
        }
        log(`Chat ${chatId}: 白名单删除 ${targetChatId[0]}`);
        await deleteMessage(cb, false, 15000);
    }

    static async ban(ctx) {
        let chatId = ctx.message.chat.id, cb;
        let targetChatId = await getQueryChatId(ctx);
        if (!targetChatId)
            return;
        await ctx.telegram.banChatSenderChat(chatId, targetChatId[0]);
        try {
            cb = await ctx.replyWithHTML(strings.ban_sender_chat_success.replace('{id}', targetChatId[0]));
        } catch (e) {
            cb = await ctx.reply(strings.permission_error.replace('{x}', strings.ban_sender_chat));
        }
        log(`Chat ${chatId}: 封禁了 ${targetChatId[0]}`);
        await deleteMessage(cb, false, 15000);
    }

    static async unban(ctx) {
        let chatId = ctx.message.chat.id, cb;
        let targetChatId = await getQueryChatId(ctx);
        if (!targetChatId)
            return;
        await ctx.telegram.unbanChatSenderChat(chatId, targetChatId[0]);
        try {
            cb = await ctx.replyWithHTML(strings.unban_sender_chat_success.replace('{id}', targetChatId[0]));
        } catch (e) {
            cb = await ctx.reply(strings.permission_error.replace('{x}', strings.unban_sender_chat));
        }
        log(`Chat ${chatId}: 解封了 ${targetChatId[0]}`);
        await deleteMessage(cb, false, 15000);
    }

    static config(ctx) {
        ctx.replyWithHTML(strings.settings, {
            reply_markup: {
                inline_keyboard: generateKeyboard(ctx.message.chat.id)
            }
        }).catch(() => null);
    }
}

export class GeneralCommands {
    static async start(ctx) {
        if (isPrivate(ctx))
            await ctx.replyWithHTML(strings.welcome_private, {disable_web_page_preview: true});
        else if (isGroup(ctx))
            await ctx.replyWithHTML(strings.welcome_group, {disable_web_page_preview: true});
        await deleteMessage(ctx.message, false);
    }

    static async help(ctx) {
        if (isPrivate(ctx))
            await ctx.replyWithHTML(strings.help, {disable_web_page_preview: true});
        else if (isGroup(ctx))
            await ctx.replyWithHTML(strings.help, {
                disable_web_page_preview: true,
                reply_markup: {
                    inline_keyboard: [[{text: strings.button_deleteMsg, callback_data: 'deleteMsg'}]]
                }
            });
        await deleteMessage(ctx.message, false);
    }
}

class OwnerCommands {
    static async stats(ctx) {
        log(`Analytics: 开始统计...`);
        let editMsg = await ctx.reply(strings.analyzing);
        let result = await getChatMembersCount(editMsg);
        await ctx.telegram.editMessageText(editMsg.chat.id,
            editMsg.message_id,
            undefined,
            strings.stats
                .replace('{g}', Object.keys(chatsList).length.toString())
                .replace('{u1}', result[0].toString())
                .replace('{e}', getActiveGroupsCount().toString())
                .replace('{u2}', result[1].toString())
        );
        log(`Analytics: 统计完成`);
    }

    static save(ctx) {
        saveData();
        ctx.reply(strings.save_success);
        log(`Data: 已备份数据`);
    }

    static exit(ctx) {
        let confirm = ctx.message.text.split(' ')[1];
        if(confirm && (confirm.toLowerCase() === 'yes' || confirm.toLowerCase() === 'y')){
            log(`Owner: 已退出`);
            ctx.stop('Owner exit');
        }
        else
            ctx.replyWithHTML(strings.exit_confirm);
    }
}
