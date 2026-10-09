import strings from './strings.js';
import { getWhitelist } from './store.js';

export async function generateKeyboard(chat, isWhitelist = false) {
    if (isWhitelist) {
        const whitelist = await getWhitelist(chat.chatId);
        const keyboard = whitelist.map((entry) => [{
            text: entry.title || String(entry.channelId),
            callback_data: 'demote_' + entry.channelId
        }]);
        keyboard.push([{ text: `${whitelist.length ? '' : '(空) '}🔙 返回`, callback_data: 'back' }]);
        return keyboard;
    }
    const mark = (on) => (on ? '✅' : '❌');
    return [
        [{ text: `${strings.deleteChannelSenderMsg} ${mark(chat.del)}`, callback_data: 'switch' }],
        [{ text: `${strings.deleteAnonymousAdminMsg} ${mark(chat.delAnonMsg)}`, callback_data: 'deleteAnonymousMessage' }],
        [{ text: `${strings.deleteLinkedChannelMsg} ${mark(chat.delLinkChanMsg)}`, callback_data: 'deleteChannelMessage' }],
        [{ text: `${strings.unpinChannelMsg} ${mark(chat.unpinChanMsg)}`, callback_data: 'unpinChannelMessage' }],
        [{ text: `${strings.deleteCommand} ${mark(chat.delCmd)}`, callback_data: 'deleteCommand' }],
        [{ text: strings.channelWhitelist, callback_data: 'whitelist' }],
        [{ text: strings.deleteMsg, callback_data: 'deleteMsg' }]
    ];
}
