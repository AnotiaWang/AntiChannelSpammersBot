import { ChatType, hasCommand, log } from "../util/misc.js";
import Data, { chatsList } from "../util/data.js";
import { handleCommand } from "./command.js";
import strings from "../strings/index.js";
import { bot } from "../../index.js";


export async function handleMessage(ctx) {
    const chatId = ctx.message.chat.id, chatType = ctx.chat.type;
    const text = ctx.message.text || ctx.message.caption;
    if (new ChatType(ctx).isGroup()) {
        Data.checkChat(chatId);
        const msg = ctx.message;
        if (msg.new_chat_members) {
            for (let x in msg.new_chat_members) {
                if (msg.new_chat_members[x].username === ctx.me) {
                    if (!chatsList[chatId])
                        chatsList[chatId] = {};
                    log(`Chat ${chatId}: 被加入群组`);
                    await ctx.reply(strings.welcome_group).catch(e => log(`Chat ${chatId}: 发送欢迎消息失败：${e.message}`));
                }
            }
        }
        // 机器人被踢出群组，清理配置文件
        else if (msg.left_chat_member && msg.left_chat_member.username === ctx.me) {
            delete chatsList[chatId];
            log(`Chat ${chatId}: 已被移除。`);
            return;
        }
        if (text && hasCommand(ctx)) {
            await handleCommand(ctx);
        }
        await judge(ctx);
    }
    else if (chatType === 'private') {
        if (text && hasCommand(ctx)) {
            await handleCommand(ctx);
        }
        else ctx.reply(strings.group_only);
    }
}

async function judge(ctx) {
    const msg = ctx.message;
    const chatId = msg.chat.id.toString();

    if (msg.sender_chat) {
        const senderChat = msg.sender_chat;
        if (senderChat.type === 'channel') {
            if (msg.is_automatic_forward) {
                if (chatsList[chatId].delLinkChanMsg)
                    await deleteMessage(msg, true);
                else if (chatsList[chatId].unpinChanMsg) {
                    await ctx.telegram.unpinChatMessage(chatId, msg.message_id).catch(err => {
                        log(`Chat ${chatId}: 取消置顶 (ID ${msg.message_id}) 失败：${err.message}`);
                        if (err.message.includes('not enough rights')) {
                            ctx.reply(strings.permission_error(strings.unpin_message))
                                .catch((e) => log(`${ctx.message.chat.id}: 发送消息失败：${e.message}`));
                        }
                    });
                }
            }
            else if (chatsList[chatId].del && !chatsList[chatId].whitelist[senderChat.id]) {
                await deleteMessage(msg, false);
            }
        }
        else if ((senderChat.type === 'group' || senderChat.type === 'supergroup') && chatsList[chatId].delAnonMsg) {
            await deleteMessage(msg, true);
        }
    }
}

export async function deleteMessage(msg, alertOnFailure = true, delay = 0) {
    const chatId = msg.chat.id, msgId = msg.message_id || msg[0].message_id;
    try {
        if (delay) {
            setTimeout(() => {
                bot.telegram.deleteMessage(chatId, msgId)
                    .catch(() => null);
            }, delay);
        }
        else {
            await bot.telegram.deleteMessage(chatId, msgId);
        }
        log(`Chat ${chatId}: 尝试删除消息，ID: ${msgId}` + (delay ? `，延迟 ${delay} 毫秒` : ''));
    }
    catch (e) {
        if (alertOnFailure) {
            if (e.message.includes("not enough rights")) {
                const delMsg = await bot.telegram.sendMessage(
                    chatId,
                    strings.deleteMsgFailure(msgId, e.message)
                ).catch(() => null);
                if (delMsg) {
                    await deleteMessage(delMsg, false, 15000);
                }
            }
        }
        log(`Chat ${chatId}: 尝试删除消息失败，ID: ${msgId}，原因：${e.message}`);
    }
}

export async function getQueryChatId(ctx) {
    let msg = ctx.message;
    let queryChatId = null, cb;

    if (msg.reply_to_message) {
        if (!(msg.reply_to_message.sender_chat && msg.reply_to_message.sender_chat.type === 'channel')) {
            cb = await ctx.reply(strings.x_not_a_channel);
            await deleteMessage(cb, false, 15000);
            return null;
        } else
            queryChatId = msg.reply_to_message.sender_chat.id;
    } else {
        queryChatId = msg.text.split(' ')[1];
        if (!queryChatId) {
            cb = await ctx.reply(strings.command_usage_error);
            await deleteMessage(cb, false, 15000);
            return null;
        }
    }
    try {
        let result = await ctx.telegram.getChat(queryChatId);
        if (result.type === 'channel')
            return [result.id.toString(), result.title];
        else {
            ctx.reply(strings.x_not_a_channel);
            return null;
        }
    } catch (e) {
        cb = await ctx.reply(strings.get_channel_error(e.message));
        await deleteMessage(cb, false, 15000);
    }
}
