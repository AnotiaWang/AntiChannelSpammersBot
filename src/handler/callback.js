import { generateKeyboard, isAdmin, log } from '../util/misc.js';
import Data, { chatsList } from '../util/data.js';
import strings from '../strings/index.js';

export async function handleCallbackQuery(ctx) {
    const query = ctx.callbackQuery;
    const chatId = query.message.chat.id;

    Data.checkChat(chatId);
    if (await isAdmin(ctx)) {
        let text = '<b>⚙️ 设置</b>', isWhitelist = false;
        switch (query.data) {
            case 'switch':
                chatsList[chatId].del = !chatsList[chatId].del;
                ctx.answerCbQuery(strings.settings_saved);
                log(`Chat ${chatId}: 删除马甲消息 设为 ${chatsList[chatId].del}`);
                break;
            case 'deleteAnonymousMessage':
                chatsList[chatId].delAnonMsg = !chatsList[chatId].delAnonMsg;
                ctx.answerCbQuery(strings.settings_saved);
                log(`Chat ${chatId}: 删除匿名消息 设为 ${chatsList[chatId].delAnonMsg}`);
                break;
            case 'deleteChannelMessage':
                chatsList[chatId].delLinkChanMsg = !chatsList[chatId].delLinkChanMsg;
                if (chatsList[chatId].unpinChanMsg && chatsList[chatId].delLinkChanMsg)
                    chatsList[chatId].unpinChanMsg = false;
                ctx.answerCbQuery(strings.settings_saved);
                log(`Chat ${chatId}: 删除链接频道消息 设为 ${chatsList[chatId].delLinkChanMsg}`);
                break;
            case 'unpinChannelMessage':
                chatsList[chatId].unpinChanMsg = !chatsList[chatId].unpinChanMsg;
                if (chatsList[chatId].unpinChanMsg && chatsList[chatId].delLinkChanMsg)
                    chatsList[chatId].delLinkChanMsg = false;
                if (chatsList[chatId].unpinChanMsg) {
                    ctx.answerCbQuery(strings.settings_saved + '（' + strings.pin_permission_needed + '）', { show_alert: true });
                }
                else {
                    ctx.answerCbQuery(strings.settings_saved);
                }
                log(`Chat ${chatId}: 取消频道消息置顶 设为 ${chatsList[chatId].unpinChanMsg}`);
                break;
            case 'deleteMsg':
                ctx.deleteMessage(query.message.message_id).catch((e) => {
                    log(`Chat ${chatId}: 删除消息失败, ID: ${query.message.message_id}, error: ${e.message}`);
                    ctx.answerCbQuery('删除消息失败，请稍后再试').catch(() => null);
                });
                log(`Chat ${chatId}: 尝试删除消息（由按钮触发）`);
                return;
            case 'whitelist':
                text = strings.whitelist_help;
                isWhitelist = true;
                break;
            case 'deleteCommand':
                chatsList[chatId].delCmd = !chatsList[chatId].delCmd;
                if (chatsList[chatId].delCmd) {
                    ctx.answerCbQuery(strings.deleteCommandHelp, { show_alert: true });
                }
                else {
                    ctx.answerCbQuery(strings.settings_saved);
                }
                log(`Chat ${chatId}: 自动清理命令 设为 ${chatsList[chatId].delCmd}`);
                break;
            default:
                break;
        }
        // 删除白名单中的频道
        if (query.data.startsWith('demote')) {
            let demoteChatId = query.data.split('_')[1];
            ctx.answerCbQuery(strings.x_removed_from_whitelist(chatsList[chatId].whitelist[demoteChatId], demoteChatId));
            text = strings.whitelist_help;
            delete chatsList[chatId].whitelist[demoteChatId];
            log(`Chat ${chatId}: 白名单中的频道 ${demoteChatId} 被移除`);
            isWhitelist = true;
        }
        ctx.editMessageText(text, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: generateKeyboard(chatId, isWhitelist)
            }
        }).catch((err) => log(`Chat ${chatId}: 编辑设置消息 (ID ${query.message.message_id}) 失败: ${err.message}`));
        Data.save();
    }
}
