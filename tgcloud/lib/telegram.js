import { api, InputFile } from 'sdk';
import { ADMIN_ID, DELETION_MAX_AGE, DELETION_SWEEP_LIMIT, NOTICE_DELETE_DELAY } from './config.js';
import { claimDueDeletions, scheduleDeletion } from './store.js';
import strings from './strings.js';

// 匿名管理员发言时的 from
export const GROUP_ANONYMOUS_BOT_ID = 1087968824;

let me = null;

// 机器人自身信息，同一 isolate 内缓存
export async function getMe() {
    if (!me) me = await api.getMe();
    return me;
}

export function log(text) {
    console.log(text);
}

// 记录错误并通知所有者；context 为引发错误的更新内容
export async function alert(text, context = null) {
    console.error(text);
    if (!ADMIN_ID) return;
    try {
        await api.sendMessage({ chat_id: ADMIN_ID, text: String(text).slice(0, 4096) });
        if (context) {
            const str = JSON.stringify(context, null, 2);
            if (str.length > 4096) {
                await api.sendDocument({
                    chat_id: ADMIN_ID,
                    document: new InputFile(encodeUtf8(str), `err_${Date.now()}.json`, { type: 'application/json' }),
                    caption: String(text).slice(0, 1024)
                });
            }
            else await api.sendMessage({ chat_id: ADMIN_ID, text: str });
        }
    }
    catch (e) {
        console.error(`通知所有者失败: ${e.description || e.message}`);
    }
}

export function errorText(e) {
    return e?.description || e?.message || String(e);
}

export function isGroup(chat) {
    return chat.type === 'group' || chat.type === 'supergroup';
}

export async function isAdmin(chatId, user) {
    if (user.id === GROUP_ANONYMOUS_BOT_ID) return true;
    try {
        const member = await api.getChatMember({ chat_id: chatId, user_id: user.id });
        return member.status === 'creator' || member.status === 'administrator';
    }
    catch (e) {
        await alert(`${chatId}: 获取管理员状态失败：${errorText(e)}`);
        return false;
    }
}

// 回复 HTML 文本，失败只记录日志。返回发出的消息或 null
export async function reply(chatId, text, extra = {}) {
    try {
        return await api.sendMessage({
            chat_id: chatId,
            text,
            parse_mode: 'HTML',
            link_preview_options: { is_disabled: true },
            ...extra
        });
    }
    catch (e) {
        log(`${chatId}: 发送消息失败：${errorText(e)}`);
        return null;
    }
}

// 平台没有定时器，延迟删除记录到数据库，由之后的更新顺带执行
export async function deleteLater(msg, delay) {
    if (!msg) return;
    await scheduleDeletion(msg.chat.id, msg.message_id, delay);
}

// 立即删除消息；alertOnFailure 时在缺少权限的情况下提示群组
export async function deleteMessage(msg, alertOnFailure = true) {
    const chatId = msg.chat.id, msgId = msg.message_id;
    try {
        await api.deleteMessage({ chat_id: chatId, message_id: msgId });
        log(`Chat ${chatId}: 尝试删除消息，ID: ${msgId}`);
    }
    catch (e) {
        const reason = errorText(e);
        log(`Chat ${chatId}: 尝试删除消息失败，ID: ${msgId}，原因：${reason}`);
        if (alertOnFailure && reason.includes('not enough rights')) {
            const notice = await reply(chatId, strings.deleteMsgFailure(msgId, reason));
            await deleteLater(notice, NOTICE_DELETE_DELAY);
        }
    }
}

// 删除已到期的延迟删除消息
export async function sweepDeletions() {
    const due = await claimDueDeletions(DELETION_SWEEP_LIMIT);
    const now = Date.now();
    for (const item of due) {
        if (now - item.deleteAt > DELETION_MAX_AGE) continue;
        await api.deleteMessage({ chat_id: item.chatId, message_id: item.messageId }).catch(() => null);
    }
}

// 运行时不一定有 TextEncoder / TextDecoder，提供基于内建函数的后备实现
export function encodeUtf8(str) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
    const binary = unescape(encodeURIComponent(str));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

export function decodeUtf8(bytes) {
    if (typeof TextDecoder !== 'undefined') return new TextDecoder().decode(bytes);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return decodeURIComponent(escape(binary));
}
