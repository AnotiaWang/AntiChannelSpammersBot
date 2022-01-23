import {isCommand, isGroup, log, checkChatData, handleCommand, saveData} from "./index.mjs";
import {chatsList, strings} from "../src/index.mjs";
import {bot, botName} from "../index.js";

export async function handleMessage(ctx) {
    let chatId = ctx.message.chat.id;
    let text = ctx.message.text || ctx.message.caption;
    if (isGroup(ctx)) {
        checkChatData(chatId);
        let msg = ctx.message;
        if (msg.new_chat_members)
            for (let x in msg.new_chat_members) {
                if (msg.new_chat_members[x].username === botName) {
                    if (!chatsList[chatId])
                        chatsList[chatId] = {};
                    log(`Chat ${chatId}: 被加入群组`);
                    await ctx.replyWithHTML(strings.welcome_group).catch(e => log(`Chat ${chatId}: 发送欢迎消息失败：${e.message}`));
                }
            }
        // // 机器人被踢出群组，清理配置文件
        else if (msg.left_chat_member && msg.left_chat_member.username === botName) {
            delete chatsList[chatId];
            log(`Chat ${chatId}: 已被移除。`);
            return;
        }
    }
    if (text && isCommand(text))
        await handleCommand(ctx);
    else
        await judge(ctx);
}

async function judge(ctx) {
    let msg = ctx.message;
    let chatId = msg.chat.id, chatType = msg.chat.type;

    if (chatType === 'private')
        return ctx.reply(strings.group_only);

    else if (isGroup(ctx) && msg.sender_chat) {
        let senderChat = msg.sender_chat;
        if (senderChat.type === 'channel') {
            if (msg.is_automatic_forward) {
                if (chatsList[chatId].delLinkChanMsg)
                    await deleteMessage(msg, true);
                else if (chatsList[chatId].unpinChanMsg) {
                    try {
                        await ctx.unpinChatMessage(chatId, msg.message_id);
                    } catch (err) {
                        ctx.reply(strings.permission_error.replace('{x}', strings.unpin_message));
                    }
                }
            } else if (chatsList[chatId].del && !chatsList[chatId].whitelist[senderChat.id]) {
                await deleteMessage(msg, false);
            }
        } else if ((chatType === 'group' || chatType === 'supergroup') && chatsList[chatId].delAnonMsg)
            await deleteMessage(msg, true);
    }
}

export async function deleteMessage(msg, alertOnFailure, delay) {
    try {
        if (delay)
            setTimeout(() => {
                bot.telegram.deleteMessage(msg.chat.id, msg.message_id)
                    .catch(() => {
                    });
            }, delay);
        else
            await bot.telegram.deleteMessage(msg.chat.id, msg.message_id);
        log(`Chat ${msg.chat.id}: 尝试删除消息，ID: ${msg.message_id}` + (delay ? `，延迟 ${delay} 毫秒` : ''));
    } catch (e) {
        if (alertOnFailure) {
            let delMsg = await bot.telegram.sendMessage(msg.chat.id, strings.deleteMsgFailure);
            await deleteMessage(delMsg, false, 15000);
        }
        log(`Chat ${msg.chat.id}: 尝试删除消息失败，ID: ${msg.message_id}，原因：${e.message}`);
    }
}

export async function getQueryChatId(ctx) {
    let msg = ctx.message, chatId = msg.chat.id;
    let queryChatId = null, targetChatId = null, cb;

    if (msg.reply_to_message) {
        if (!msg.reply_to_message.sender_chat || msg.reply_to_message.sender_chat.type !== 'channel') {
            cb = await ctx.reply(strings.x_not_a_channel);
            await deleteMessage(cb, false, 15000);
            return null;
        } else
            queryChatId = msg.reply_to_message.sender_chat.id;
    } else {
        queryChatId = msg.text.split(' ')[1];
        if (!queryChatId) {
            cb = await ctx.replyWithHTML(strings.command_usage_error);
            await deleteMessage(cb, false, 15000);
            return null;
        }
    }
    try {
        let result = await ctx.telegram.getChat(queryChatId);
        return [result.id.toString(), result.title];
    } catch (e) {
        cb = await ctx.reply(strings.get_channel_error.replace('{code}', e.message));
        await deleteMessage(cb, false, 15000);
    }
}