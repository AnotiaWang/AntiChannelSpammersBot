import { table, integer, text, boolean, json, index, primaryKey } from 'sdk/db';

// 每个群组的设置，对应旧版 chatsList.json 中的一项
export const chats = table('chats', {
    chatId: integer('chat_id').primaryKey(),
    del: boolean('del').notNull().default(false),
    delCmd: boolean('del_cmd').notNull().default(false),
    delAnonMsg: boolean('del_anon_msg').notNull().default(false),
    delLinkChanMsg: boolean('del_link_chan_msg').notNull().default(false),
    unpinChanMsg: boolean('unpin_chan_msg').notNull().default(false)
});

// 频道马甲白名单。没有外键，删除群组时需在代码中一并删除
export const whitelist = table('whitelist', {
    chatId: integer('chat_id').notNull(),
    channelId: integer('channel_id').notNull(),
    title: text('title').notNull().default('')
}, (t) => ({
    pk: primaryKey({ columns: [t.chatId, t.channelId] })
}));

// 延迟删除的消息。平台没有定时器，由之后到达的更新顺带清理
export const pendingDeletions = table('pending_deletions', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    chatId: integer('chat_id').notNull(),
    messageId: integer('message_id').notNull(),
    deleteAt: integer('delete_at').notNull() // unix ms
}, (t) => ({
    deleteAtIdx: index('idx_pending_deletions_delete_at').on(t.deleteAt)
}));

// 杂项状态，如 /stats members 的统计进度
export const kv = table('kv', {
    key: text('key').primaryKey(),
    value: json('value')
});
