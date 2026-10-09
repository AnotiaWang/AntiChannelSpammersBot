// 成员数统计：逐个群组调用 getChatMemberCount，期间定时回报进度
import { api } from 'sdk';
import { STATS_PROGRESS_INTERVAL } from './config.js';
import { allChats, deleteChat } from './store.js';
import { errorText, log } from './telegram.js';

const STALE_CHAT_ERRORS = ['kicked', 'not found', 'upgraded', 'deleted'];
// 同一群组被限流的最多重试次数，超过后跳过
const MAX_ATTEMPTS = 5;

function sleep(ms) {
    return typeof setTimeout === 'function' ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

// onProgress(processed, total) 每隔 STATS_PROGRESS_INTERVAL 调用一次
// 返回 { total, joinedMembers, enabledMembers, removed, skipped }
export async function countMembers(onProgress) {
    const queue = (await allChats()).map((chat) => ({ chat, attempts: 0 }));
    const total = queue.length;
    let processed = 0, joinedMembers = 0, enabledMembers = 0, removed = 0, skipped = 0;
    let lastReport = Date.now();

    while (queue.length) {
        const item = queue.shift();
        const { chat } = item;
        try {
            const count = await api.getChatMemberCount({ chat_id: chat.chatId });
            joinedMembers += count;
            if (chat.del) enabledMembers += count;
            processed++;
        }
        catch (e) {
            if (e.code === 429 && ++item.attempts < MAX_ATTEMPTS) {
                // 放回队尾，等待限流解除后继续
                queue.push(item);
                await sleep((e.parameters?.retry_after ?? 1) * 1000);
                continue;
            }
            const reason = errorText(e);
            if (STALE_CHAT_ERRORS.some((s) => reason.includes(s))) {
                log(`Analytics: ${chat.chatId} 状态异常，已清除其配置数据`);
                await deleteChat(chat.chatId);
                removed++;
            }
            else skipped++;
            processed++;
        }
        if (Date.now() - lastReport >= STATS_PROGRESS_INTERVAL) {
            lastReport = Date.now();
            await onProgress(processed, total);
        }
    }
    return { total, joinedMembers, enabledMembers, removed, skipped };
}
