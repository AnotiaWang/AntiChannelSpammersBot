// 数据库访问。统一使用原始 SQL：开关可以写成原子更新，避免并发调用互相覆盖。
// 原始 SQL 读出的布尔值是 0/1，需自行转换。
import { db } from 'sdk';

export const SETTING_COLUMNS = {
    del: 'del',
    delCmd: 'del_cmd',
    delAnonMsg: 'del_anon_msg',
    delLinkChanMsg: 'del_link_chan_msg',
    unpinChanMsg: 'unpin_chan_msg'
};

// 这两个开关互斥：打开其中一个时关闭另一个
const EXCLUSIVE = {
    delLinkChanMsg: 'unpinChanMsg',
    unpinChanMsg: 'delLinkChanMsg'
};

function defaultChat(chatId) {
    const chat = { chatId };
    for (const key in SETTING_COLUMNS) chat[key] = false;
    return chat;
}

function rowToChat(row) {
    const chat = { chatId: row.chat_id };
    for (const [key, column] of Object.entries(SETTING_COLUMNS)) chat[key] = Boolean(row[column]);
    return chat;
}

export async function getChat(chatId) {
    const row = await db.get('SELECT * FROM chats WHERE chat_id = :id', { ':id': chatId });
    return row ? rowToChat(row) : null;
}

// 读取群组设置，不存在时以默认值创建
export async function ensureChat(chatId) {
    const chat = await getChat(chatId);
    if (chat) return chat;
    await db.run('INSERT INTO chats (chat_id) VALUES (:id) ON CONFLICT DO NOTHING', { ':id': chatId });
    return defaultChat(chatId);
}

export async function setSetting(chatId, key, value) {
    await db.run(`UPDATE chats SET ${SETTING_COLUMNS[key]} = :v WHERE chat_id = :id`, { ':id': chatId, ':v': value ? 1 : 0 });
}

// 原子地切换一个开关，返回切换后的设置
export async function toggleSetting(chatId, key) {
    const column = SETTING_COLUMNS[key];
    let set = `${column} = NOT ${column}`;
    if (EXCLUSIVE[key]) {
        // SET 右侧引用的是旧值：旧值为假即本次打开，此时关闭互斥的开关
        const other = SETTING_COLUMNS[EXCLUSIVE[key]];
        set += `, ${other} = CASE WHEN ${column} THEN ${other} ELSE 0 END`;
    }
    const { rows } = await db.run(`UPDATE chats SET ${set} WHERE chat_id = :id RETURNING *`, { ':id': chatId });
    return rows.length ? rowToChat(rows[0]) : null;
}

// 机器人退群时清理该群的全部数据
export async function deleteChat(chatId) {
    await db.run('DELETE FROM whitelist WHERE chat_id = :id', { ':id': chatId });
    await db.run('DELETE FROM chats WHERE chat_id = :id', { ':id': chatId });
}

export async function getWhitelist(chatId) {
    const rows = await db.all('SELECT channel_id, title FROM whitelist WHERE chat_id = :id ORDER BY rowid', { ':id': chatId });
    return rows.map((r) => ({ channelId: r.channel_id, title: r.title }));
}

export async function isWhitelisted(chatId, channelId) {
    const row = await db.get('SELECT 1 AS hit FROM whitelist WHERE chat_id = :c AND channel_id = :ch', { ':c': chatId, ':ch': channelId });
    return Boolean(row);
}

// 返回是否新增
export async function addToWhitelist(chatId, channelId, title) {
    const { rowsAffected } = await db.run(
        'INSERT INTO whitelist (chat_id, channel_id, title) VALUES (:c, :ch, :t) ON CONFLICT DO NOTHING',
        { ':c': chatId, ':ch': channelId, ':t': title ?? '' }
    );
    return rowsAffected > 0;
}

// 返回被移除频道的名称，不在白名单中时返回 null
export async function removeFromWhitelist(chatId, channelId) {
    const { rows } = await db.run(
        'DELETE FROM whitelist WHERE chat_id = :c AND channel_id = :ch RETURNING title',
        { ':c': chatId, ':ch': channelId }
    );
    return rows.length ? rows[0].title : null;
}

export async function scheduleDeletion(chatId, messageId, delay) {
    await db.run(
        'INSERT INTO pending_deletions (chat_id, message_id, delete_at) VALUES (:c, :m, :at)',
        { ':c': chatId, ':m': messageId, ':at': Date.now() + delay }
    );
}

// 取出并移除到期的待删除消息。先用只读查询判断，避免每次更新都写库；
// DELETE ... RETURNING 保证并发调用不会重复领取同一条
export async function claimDueDeletions(limit) {
    const now = Date.now();
    const due = await db.get('SELECT 1 AS hit FROM pending_deletions WHERE delete_at <= :now LIMIT 1', { ':now': now });
    if (!due) return [];
    const { rows } = await db.run(
        `DELETE FROM pending_deletions WHERE id IN (
            SELECT id FROM pending_deletions WHERE delete_at <= :now ORDER BY delete_at LIMIT :limit
        ) RETURNING chat_id, message_id, delete_at`,
        { ':now': now, ':limit': limit }
    );
    return rows.map((r) => ({ chatId: r.chat_id, messageId: r.message_id, deleteAt: r.delete_at }));
}

export async function getCounts() {
    const anyOn = Object.values(SETTING_COLUMNS).join(' OR ');
    const row = await db.get(`SELECT
        (SELECT count(*) FROM chats) AS joined_groups,
        (SELECT count(*) FROM chats WHERE ${anyOn}) AS enabled_groups,
        (SELECT count(*) FROM chats WHERE del) AS del_groups,
        (SELECT count(*) FROM whitelist) AS whitelist_entries,
        (SELECT count(*) FROM pending_deletions) AS pending_deletions`);
    return {
        joinedGroups: row.joined_groups,
        enabledGroups: row.enabled_groups,
        delGroups: row.del_groups,
        whitelistEntries: row.whitelist_entries,
        pendingDeletions: row.pending_deletions
    };
}

export async function allChats() {
    return (await db.all('SELECT * FROM chats ORDER BY chat_id')).map(rowToChat);
}

export async function allWhitelist() {
    const rows = await db.all('SELECT chat_id, channel_id, title FROM whitelist ORDER BY chat_id, rowid');
    return rows.map((r) => ({ chatId: r.chat_id, channelId: r.channel_id, title: r.title }));
}

// 批量写入的每批行数，控制在 SQLite 的变量数上限（999）以内
const CHAT_BATCH = 100;      // 6 列
const WHITELIST_BATCH = 200; // 3 列

function chunk(list, size) {
    const out = [];
    for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
    return out;
}

function placeholders(rows, columns, prefix) {
    const params = {};
    const tuples = rows.map((row, i) => '(' + columns.map((col, j) => {
        const name = `:${prefix}${i}_${j}`;
        params[name] = row[col];
        return name;
    }).join(', ') + ')');
    return { sql: tuples.join(', '), params };
}

// 覆盖写入群组设置；这些群组原有的白名单会被替换
export async function importChats(chats, entries) {
    const keys = Object.keys(SETTING_COLUMNS);
    const columns = Object.values(SETTING_COLUMNS);
    for (const part of chunk(chats, CHAT_BATCH)) {
        const ids = {};
        const list = part.map((c, i) => {
            ids[`:d${i}`] = c.chatId;
            return `:d${i}`;
        }).join(', ');
        await db.run(`DELETE FROM whitelist WHERE chat_id IN (${list})`, ids);

        const rows = part.map((c) => {
            const row = { chat_id: c.chatId };
            for (const key of keys) row[SETTING_COLUMNS[key]] = c[key] ? 1 : 0;
            return row;
        });
        const values = placeholders(rows, ['chat_id', ...columns], 'c');
        await db.run(
            `INSERT INTO chats (chat_id, ${columns.join(', ')}) VALUES ${values.sql}
             ON CONFLICT (chat_id) DO UPDATE SET ${columns.map((col) => `${col} = excluded.${col}`).join(', ')}`,
            values.params
        );
    }
    for (const part of chunk(entries, WHITELIST_BATCH)) {
        const rows = part.map((e) => ({ chat_id: e.chatId, channel_id: e.channelId, title: e.title }));
        const values = placeholders(rows, ['chat_id', 'channel_id', 'title'], 'w');
        await db.run(
            `INSERT INTO whitelist (chat_id, channel_id, title) VALUES ${values.sql}
             ON CONFLICT (chat_id, channel_id) DO UPDATE SET title = excluded.title`,
            values.params
        );
    }
}
