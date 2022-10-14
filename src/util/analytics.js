import Data, { chatsList } from './data.js';
import { bot } from '../../index.js';
import { log } from './misc.js';

class Analytics {
    static activeGroupsCount() {
        let count = 0;
        for (let chatId in chatsList) {
            for (let config in chatsList[chatId]) {
                if (chatsList[chatId][config] === true) {
                    count++;
                    break;
                }
            }
        }
        return count;
    }

    static async chatMembersCount(editMsg) {
        let activeCount = 0, totalCount = 0, i = 0;
        let interval = setInterval(() => {
            bot.telegram.editMessageText(editMsg.chat.id, editMsg.message_id, undefined, '统计中 ' + (i / Object.keys(chatsList).length * 100).toFixed(2) + '% ...').catch(() => {
            });
        }, 3000);
        let chatIds = Object.keys(chatsList);
        while (chatIds.length > 0) {
            let chat = chatIds.shift();
            try {
                let cb = await bot.telegram.getChatMembersCount(chat);
                i++;
                totalCount += cb;
                if (chatsList[chat].del)
                    activeCount += cb;
            }
            catch (err) {
                if (err.message.includes('kicked') ||
                    err.message.includes('not found') ||
                    err.message.includes('upgraded') ||
                    err.message.includes('deleted')) {
                    log(`Analytics: ${chat} 状态异常，已清除其配置数据`);
                    delete chatsList[chat];
                    Data.save();
                }
                else if (err.message.includes('Too Many Requests')) {
                    chatIds.push(chat);
                }
            }
        }
        clearInterval(interval);
        return [totalCount, activeCount];
    }
}

export default Analytics;
