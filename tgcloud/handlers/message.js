import strings from '../lib/strings.js';
import { deleteChat, ensureChat, getChat, isWhitelisted } from '../lib/store.js';
import { handleCommand, parseCommand } from '../lib/commands.js';
import {
    alert, deleteMessage, errorText, getMe, isGroup, log, reply, sweepDeletions
} from '../lib/telegram.js';
import { api } from 'sdk';

export default async function (message) {
    try {
        await handleMessage(message);
    }
    catch (e) {
        await alert(e?.stack || errorText(e), message);
    }
    try {
        await sweepDeletions();
    }
    catch (e) {
        console.error(`清理延迟删除的消息失败: ${errorText(e)}`);
    }
}

async function handleMessage(msg) {
    const chatId = msg.chat.id;
    const cmd = parseCommand(msg);

    if (isGroup(msg.chat)) {
        // 机器人被踢出群组，清理配置
        if (msg.left_chat_member && msg.left_chat_member.id === (await getMe()).id) {
            await deleteChat(chatId);
            log(`Chat ${chatId}: 已被移除。`);
            return;
        }
        let chat = await ensureChat(chatId);
        if (msg.new_chat_members) {
            const me = await getMe();
            if (msg.new_chat_members.some((user) => user.id === me.id)) {
                log(`Chat ${chatId}: 被加入群组`);
                await reply(chatId, strings.welcome_group);
            }
        }
        if (cmd) {
            await handleCommand(msg, cmd, chat);
            // 命令可能修改了设置
            chat = (await getChat(chatId)) ?? chat;
        }
        await judge(msg, chat);
    }
    else if (msg.chat.type === 'private') {
        if (cmd) await handleCommand(msg, cmd, null);
        else await reply(chatId, strings.group_only);
    }
}

async function judge(msg, chat) {
    const chatId = msg.chat.id;
    const senderChat = msg.sender_chat;
    if (!senderChat) return;

    if (senderChat.type === 'channel') {
        if (msg.is_automatic_forward) {
            if (chat.delLinkChanMsg) {
                await deleteMessage(msg, true);
            }
            else if (chat.unpinChanMsg) {
                try {
                    await api.unpinChatMessage({ chat_id: chatId, message_id: msg.message_id });
                }
                catch (e) {
                    const reason = errorText(e);
                    log(`Chat ${chatId}: 取消置顶 (ID ${msg.message_id}) 失败：${reason}`);
                    if (reason.includes('not enough rights')) {
                        await reply(chatId, strings.permission_error(strings.unpin_message));
                    }
                }
            }
        }
        else if (chat.del && !(await isWhitelisted(chatId, senderChat.id))) {
            await deleteMessage(msg, false);
        }
    }
    else if ((senderChat.type === 'group' || senderChat.type === 'supergroup') && chat.delAnonMsg) {
        await deleteMessage(msg, true);
    }
}
