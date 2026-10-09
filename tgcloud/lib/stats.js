// 成员数统计：对每个群组调用 getChatMemberCount。平台限制单次执行时长，
// 因此每次最多运行 STATS_TIME_BUDGET，进度存入 kv；未完成时在进度消息上附「继续统计」按钮，
// 点击后在同一条消息中继续。执行中途被平台终止时，再次发送 /stats members 也会从上次保存处继续。
import { api } from 'sdk';
import { STATS_CONCURRENCY, STATS_PROGRESS_INTERVAL, STATS_TIME_BUDGET } from './config.js';
import strings from './strings.js';
import { countChats, deleteChat, kvDelete, kvGet, kvInsert, kvLock, kvSet, listChatsAfter } from './store.js';
import { errorText, log } from './telegram.js';

const KEY = 'stats_members';
const PAGE_SIZE = 50;
const STALE_CHAT_ERRORS = ['kicked', 'not found', 'upgraded', 'deleted'];
const MAX_ATTEMPTS = 5;
export const CONTINUE_CALLBACK = 'stats_continue';

function sleep(ms) {
    return typeof setTimeout === 'function' ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

export async function resetMemberStats() {
    await kvDelete(KEY);
}

// 统计一个群组。被限流且等待会超出 deadline 时返回 retry_after（秒），稍后重试；否则返回 0
async function countChat(chat, state, deadline) {
    for (let attempt = 1; ; attempt++) {
        try {
            const count = await api.getChatMemberCount({ chat_id: chat.chatId });
            state.joinedMembers += count;
            if (chat.del) state.enabledMembers += count;
            break;
        }
        catch (e) {
            if (e.code === 429 && attempt < MAX_ATTEMPTS) {
                const wait = (e.parameters?.retry_after ?? 1) * 1000;
                if (Date.now() + wait >= deadline) return Math.ceil(wait / 1000);
                await sleep(wait);
                continue;
            }
            if (STALE_CHAT_ERRORS.some((s) => errorText(e).includes(s))) {
                log(`Analytics: ${chat.chatId} 状态异常，已清除其配置数据`);
                await deleteChat(chat.chatId);
                state.removed++;
            }
            else state.skipped++;
            break;
        }
    }
    state.processed++;
    return 0;
}

// 并发统计一批群组，被限流的放入 state.retry。返回最长的 retry_after
async function countBatch(batch, state, deadline) {
    const waits = await Promise.all(batch.map((chat) => countChat(chat, state, deadline)));
    batch.forEach((chat, i) => {
        if (waits[i]) state.retry.push({ chatId: chat.chatId, del: chat.del });
    });
    return Math.max(0, ...waits);
}

// 已没有待统计的群组
async function finished(state) {
    return !state.retry.length && !(await listChatsAfter(state.cursor, 1)).length;
}

// 在时间预算内推进统计。返回 { done, rateLimited }，rateLimited 为需等待的秒数
async function run(state, onProgress) {
    const deadline = Date.now() + STATS_TIME_BUDGET;
    let lastReport = Date.now();
    const report = async () => {
        if (Date.now() - lastReport < STATS_PROGRESS_INTERVAL) return;
        lastReport = Date.now();
        await kvSet(KEY, state);
        await onProgress(state);
    };

    // 先处理上次被限流的群组
    const retry = state.retry;
    state.retry = [];
    for (let i = 0; i < retry.length; i += STATS_CONCURRENCY) {
        const wait = await countBatch(retry.slice(i, i + STATS_CONCURRENCY), state, deadline);
        if (wait || Date.now() >= deadline) {
            state.retry.push(...retry.slice(i + STATS_CONCURRENCY));
            return { done: !wait && await finished(state), rateLimited: wait };
        }
        await report();
    }

    while (Date.now() < deadline) {
        const page = await listChatsAfter(state.cursor, PAGE_SIZE);
        if (!page.length) return { done: !state.retry.length, rateLimited: 0 };
        for (let i = 0; i < page.length; i += STATS_CONCURRENCY) {
            const batch = page.slice(i, i + STATS_CONCURRENCY);
            const wait = await countBatch(batch, state, deadline);
            state.cursor = batch.at(-1).chatId;
            if (wait) return { done: false, rateLimited: wait };
            if (Date.now() >= deadline) return { done: await finished(state), rateLimited: 0 };
            await report();
        }
    }
    return { done: await finished(state), rateLimited: 0 };
}

async function edit(state, text, keyboard = null) {
    await api.editMessageText({
        chat_id: state.chatId,
        message_id: state.messageId,
        text,
        parse_mode: 'HTML',
        ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {})
    }).catch(() => null);
}

// 锁的有效期：预算之外留出余量，覆盖进行中的请求。执行被平台终止时，锁到期后即可继续
const lockUntil = () => Date.now() + STATS_TIME_BUDGET + 5_000;

// 运行一段统计并更新进度消息。调用前 state 须已加锁
async function proceed(state) {
    if (state.messageId) await edit(state, strings.stats_members_progress(state.processed, state.total));
    else {
        const message = await api.sendMessage({ chat_id: state.chatId, text: strings.analyzing });
        state.messageId = message.message_id;
        await kvSet(KEY, state);
    }
    const result = await run(state, (s) => edit(s, strings.stats_members_progress(s.processed, s.total)));
    if (result.done) {
        await kvDelete(KEY);
        await edit(state, strings.stats_members(state));
        log('Analytics: 统计完成');
        return;
    }
    state.lockedUntil = 0;
    await kvSet(KEY, state);
    await edit(state, strings.stats_members_paused(state.processed, state.total, result.rateLimited), [
        [{ text: strings.stats_members_continue, callback_data: CONTINUE_CALLBACK }]
    ]);
}

// /stats members：有未完成的统计时在原消息中继续，否则新建一条进度消息开始统计。
// 统计正在进行时返回 false
export async function startMemberStats(chatId) {
    const locked = await kvLock(KEY, lockUntil());
    if (locked) {
        await proceed(locked);
        return true;
    }
    if (await kvGet(KEY)) return false;

    const state = {
        chatId,
        messageId: null,
        cursor: null,
        retry: [],
        total: await countChats(),
        processed: 0,
        joinedMembers: 0,
        enabledMembers: 0,
        removed: 0,
        skipped: 0,
        lockedUntil: lockUntil()
    };
    if (!(await kvInsert(KEY, state))) return false;
    log('Analytics: 开始统计...');
    await proceed(state);
    return true;
}

// 点击「继续统计」。不能继续时返回提示文字；可以继续时先调用 onAccept（用于应答按钮），再运行
export async function continueMemberStats(onAccept) {
    const locked = await kvLock(KEY, lockUntil());
    if (!locked) return (await kvGet(KEY)) ? strings.stats_members_running : strings.stats_members_none;
    await onAccept();
    await proceed(locked);
    return null;
}
