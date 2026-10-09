import { api } from 'sdk';
import strings from '../lib/strings.js';
import { ensureChat, removeFromWhitelist, toggleSetting } from '../lib/store.js';
import { generateKeyboard } from '../lib/keyboard.js';
import { alert, errorText, isAdmin, log, sweepDeletions } from '../lib/telegram.js';
import { ADMIN_ID } from '../lib/config.js';
import { CONTINUE_CALLBACK, continueMemberStats } from '../lib/stats.js';

export default async function (query) {
    try {
        await handleCallbackQuery(query);
    }
    catch (e) {
        await alert(e?.stack || errorText(e), query);
    }
    try {
        await sweepDeletions();
    }
    catch (e) {
        console.error(`清理延迟删除的消息失败: ${errorText(e)}`);
    }
}

async function answer(query, text, showAlert = false) {
    await api.answerCallbackQuery({ callback_query_id: query.id, text, show_alert: showAlert }).catch(() => null);
}

// 按钮对应的开关
const TOGGLES = {
    switch: 'del',
    deleteAnonymousMessage: 'delAnonMsg',
    deleteChannelMessage: 'delLinkChanMsg',
    unpinChannelMessage: 'unpinChanMsg',
    deleteCommand: 'delCmd'
};

async function handleCallbackQuery(query) {
    const message = query.message;
    if (!message) {
        await answer(query);
        return;
    }
    const chatId = message.chat.id;

    // 所有者私聊中的「继续统计」
    if (query.data === CONTINUE_CALLBACK) {
        if (!ADMIN_ID || query.from.id !== ADMIN_ID) {
            await answer(query);
            return;
        }
        const refused = await continueMemberStats(() => answer(query));
        if (refused) await answer(query, refused);
        return;
    }

    if (!(await isAdmin(chatId, query.from))) {
        await answer(query, strings.query_sender_not_admin, true);
        return;
    }

    let chat = await ensureChat(chatId);
    let text = strings.settings, isWhitelist = false;
    const data = query.data ?? '';

    if (data === 'deleteMsg') {
        try {
            await api.deleteMessage({ chat_id: chatId, message_id: message.message_id });
            log(`Chat ${chatId}: 尝试删除消息（由按钮触发）`);
            await answer(query);
        }
        catch (e) {
            log(`Chat ${chatId}: 删除消息失败, ID: ${message.message_id}, error: ${errorText(e)}`);
            await answer(query, strings.deleteMsgCallbackFailure);
        }
        return;
    }

    if (Object.hasOwn(TOGGLES, data)) {
        const key = TOGGLES[data];
        chat = (await toggleSetting(chatId, key)) ?? chat;
        log(`Chat ${chatId}: ${key} 设为 ${chat[key]}`);
        if (key === 'unpinChanMsg' && chat.unpinChanMsg) {
            await answer(query, `${strings.settings_saved}（${strings.pin_permission_needed}）`, true);
        }
        else if (key === 'delCmd' && chat.delCmd) {
            await answer(query, strings.deleteCommandHelp, true);
        }
        else await answer(query, strings.settings_saved);
    }
    else if (data === 'whitelist') {
        text = strings.whitelist_help;
        isWhitelist = true;
        await answer(query);
    }
    else if (data.startsWith('demote_')) {
        // 删除白名单中的频道
        const channelId = Number(data.slice('demote_'.length));
        const title = await removeFromWhitelist(chatId, channelId);
        if (title !== null) {
            await answer(query, strings.x_removed_from_whitelist_plain(title, channelId));
            log(`Chat ${chatId}: 白名单中的频道 ${channelId} 被移除`);
        }
        else await answer(query, strings.x_not_in_whitelist);
        text = strings.whitelist_help;
        isWhitelist = true;
    }
    else await answer(query); // back 等：回到设置页

    try {
        await api.editMessageText({
            chat_id: chatId,
            message_id: message.message_id,
            text,
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: await generateKeyboard(chat, isWhitelist) }
        });
    }
    catch (e) {
        log(`Chat ${chatId}: 编辑设置消息 (ID ${message.message_id}) 失败: ${errorText(e)}`);
    }
}
