import {strings, chatsList} from '../src/index.mjs';
import {checkChatData, generateKeyboard, isAdmin, log, saveData} from "./index.mjs";

export async function handleCallbackQuery(ctx) {
    let query = ctx.callbackQuery;
    let chatId = query.message.chat.id;
    log(`Chat ${chatId}: 触发内联键盘按钮, Query ID: ${query.id}`);
    checkChatData(chatId);
    if (await isAdmin(ctx)) {
        let text = '<b>⚙️ 设置</b>', isWhitelist = false;
        switch (query.data) {
            case 'switch':
                chatsList[chatId].del = !chatsList[chatId].del;
                log(`Chat ${chatId}: 删除马甲消息 设为 ${chatsList[chatId].del}`);
                ctx.answerCbQuery(strings.settings_saved);
                break;
            case 'deleteAnonymousMessage':
                chatsList[chatId].delAnonMsg = !chatsList[chatId].delAnonMsg;
                log(`Chat ${chatId}: 删除匿名消息 设为 ${chatsList[chatId].delAnonMsg}`);
                ctx.answerCbQuery(strings.settings_saved);
                break;
            case 'deleteChannelMessage':
                chatsList[chatId].delLinkChanMsg = !chatsList[chatId].delLinkChanMsg;
                if (chatsList[chatId].unpinChanMsg === chatsList[chatId].delLinkChanMsg)
                    chatsList[chatId].unpinChanMsg = false;
                log(`Chat ${chatId}: 删除链接频道消息 设为 ${chatsList[chatId].delLinkChanMsg}`);
                ctx.answerCbQuery(strings.settings_saved);
                break;
            case 'unpinChannelMessage':
                chatsList[chatId].unpinChanMsg = !chatsList[chatId].unpinChanMsg;
                if (chatsList[chatId].unpinChanMsg === chatsList[chatId].delLinkChanMsg)
                    chatsList[chatId].delLinkChanMsg = false;
                log(`Chat ${chatId}: 取消频道消息置顶 设为 ${chatsList[chatId].unpinChanMsg}`);
                if (chatsList[chatId].unpinChanMsg)
                    ctx.answerCbQuery(strings.settings_saved + '（' + strings.pin_permission_needed + '）', {show_alert: true});
                else
                    ctx.answerCbQuery(strings.settings_saved);
                break;
            case 'deleteMsg':
                ctx.deleteMessage(query.message.message_id).catch((e) => {
                    log(`Chat ${chatId}: 删除消息失败, ID: ${query.message.message_id}, error: ${e.message}`);
                    ctx.answerCbQuery('删除消息失败，请稍后再试').catch(() => null);
                });
                return;
            case 'whitelist':
                text = strings.whitelist_help;
                isWhitelist = true;
                break;
            default:
                break;
        }
        // 删除白名单中的频道
        if (query.data.startsWith('demote')) {
            let demoteChatId = query.data.split('_')[1];
            ctx.answerCbQuery(strings.x_removed_from_whitelist.replace('{x}', chatsList[chatId].whitelist[demoteChatId]).replace('{id}', demoteChatId));
            text = strings.whitelist_help;
            delete chatsList[chatId].whitelist[demoteChatId];
            log(`Chat ${chatId}: 白名单中的频道 ${demoteChatId} 被移除`);
            isWhitelist = true;
        }
        ctx.editMessageText(text, {
            parse_mode: 'HTML',
            reply_markup: {inline_keyboard: generateKeyboard(chatId, isWhitelist)}
        }).catch((err) => log(`Chat ${chatId}: 编辑设置消息 (ID ${query.message.message_id}) 失败: ${err.message}`));
        saveData();
    }
}
