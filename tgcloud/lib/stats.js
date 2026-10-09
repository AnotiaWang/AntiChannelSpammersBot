// 成员数统计需要对每个群组调用一次 getChatMemberCount，可能超出单次调用的执行时长，
// 因此分段进行：每次调用在时间预算内尽量统计，进度存入 kv，再次发送命令时继续
import { api } from 'sdk';
import { STATS_TIME_BUDGET } from './config.js';
import { countChats, deleteChat, kvDelete, kvGet, kvSet, listChatsAfter } from './store.js';
import { errorText, log } from './telegram.js';

const KEY = 'stats_members';
const PAGE_SIZE = 50;
const STALE_CHAT_ERRORS = ['kicked', 'not found', 'upgraded', 'deleted'];

export async function resetMemberStats() {
    await kvDelete(KEY);
}

// 返回 { done, scanned, total, joinedMembers, enabledMembers, removed, rateLimited }
export async function countMembers() {
    const deadline = Date.now() + STATS_TIME_BUDGET;
    const state = await kvGet(KEY) ?? {
        cursor: null, scanned: 0, joinedMembers: 0, enabledMembers: 0, removed: 0, total: await countChats()
    };
    let rateLimited = false;

    outer:
    while (Date.now() < deadline) {
        const page = await listChatsAfter(state.cursor, PAGE_SIZE);
        if (!page.length) {
            await kvDelete(KEY);
            return { ...state, done: true, rateLimited };
        }
        for (const chat of page) {
            if (Date.now() >= deadline) break outer;
            try {
                const count = await api.getChatMemberCount({ chat_id: chat.chatId });
                state.joinedMembers += count;
                if (chat.del) state.enabledMembers += count;
            }
            catch (e) {
                if (e.code === 429) {
                    // 不推进游标，下次从这个群组继续
                    rateLimited = true;
                    break outer;
                }
                const reason = errorText(e);
                if (STALE_CHAT_ERRORS.some((s) => reason.includes(s))) {
                    log(`Analytics: ${chat.chatId} 状态异常，已清除其配置数据`);
                    await deleteChat(chat.chatId);
                    state.removed++;
                }
            }
            state.cursor = chat.chatId;
            state.scanned++;
        }
    }
    await kvSet(KEY, state);
    return { ...state, done: false, rateLimited };
}
