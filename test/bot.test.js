import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as schema from '../tgcloud/schema.js';
import onMessage from '../tgcloud/handlers/message.js';
import onCallbackQuery from '../tgcloud/handlers/callback_query.js';
import { ensureChat, getChat, getWhitelist, isWhitelisted, setSetting, addToWhitelist } from '../tgcloud/lib/store.js';
import { parseChatsList } from '../tgcloud/lib/transfer.js';
import { decodeUtf8, encodeUtf8 } from '../tgcloud/lib/telegram.js';
import { resetDatabase, db } from './fake-sdk/db.js';
import { BOT, BotApiError, callsOf, handlers, resetApi } from './fake-sdk/index.js';
import { TEST_ADMIN_ID } from './sdk-loader.js';

const GROUP = { id: -1001, type: 'supergroup', title: 'Group' };
const ADMIN = { id: 1, first_name: 'Admin' };
const USER = { id: 2, first_name: 'User' };
const OWNER = { id: TEST_ADMIN_ID, first_name: 'Owner' };
const CHANNEL = { id: -100777, type: 'channel', title: 'Spam <channel>' };
const LINKED = { id: -100888, type: 'channel', title: 'Linked' };

let nextId = 1;
const groupMsg = (extra = {}) => ({ message_id: nextId++, date: 0, chat: GROUP, from: USER, ...extra });
const privateMsg = (from, extra = {}) => ({
    message_id: nextId++, date: 0, chat: { id: from.id, type: 'private' }, from, ...extra
});
const command = (text, extra = {}) => ({
    text, entities: [{ type: 'bot_command', offset: 0, length: text.split(' ')[0].length }], ...extra
});
const deleted = () => callsOf('deleteMessage').map((p) => p.message_id);
const sentTexts = () => callsOf('sendMessage').map((p) => p.text);

beforeEach(() => {
    resetDatabase(schema);
    resetApi();
    handlers.getChatMember = ({ user_id }) => ({ status: user_id === ADMIN.id ? 'administrator' : 'member', user: { id: user_id } });
});

test('删除频道马甲消息，白名单中的频道除外', async () => {
    await ensureChat(GROUP.id);
    await setSetting(GROUP.id, 'del', true);
    await addToWhitelist(GROUP.id, LINKED.id, LINKED.title);

    const spam = groupMsg({ from: { id: 136817688 }, sender_chat: CHANNEL, text: 'hi' });
    const allowed = groupMsg({ from: { id: 136817688 }, sender_chat: LINKED, text: 'hi' });
    await onMessage(spam);
    await onMessage(allowed);
    assert.deepEqual(deleted(), [spam.message_id]);
});

test('未开启时不删除，并为新群组创建默认设置', async () => {
    await onMessage(groupMsg({ sender_chat: CHANNEL, text: 'hi' }));
    assert.deepEqual(deleted(), []);
    assert.deepEqual(await getChat(GROUP.id), {
        chatId: GROUP.id, del: false, delCmd: false, delAnonMsg: false, delLinkChanMsg: false, unpinChanMsg: false
    });
});

test('关联频道消息：删除或解除置顶；匿名管理消息', async () => {
    await ensureChat(GROUP.id);
    await setSetting(GROUP.id, 'unpinChanMsg', true);
    const forward = groupMsg({ sender_chat: LINKED, is_automatic_forward: true });
    await onMessage(forward);
    assert.deepEqual(callsOf('unpinChatMessage'), [{ chat_id: GROUP.id, message_id: forward.message_id }]);
    assert.deepEqual(deleted(), []);

    await setSetting(GROUP.id, 'delLinkChanMsg', true);
    const forward2 = groupMsg({ sender_chat: LINKED, is_automatic_forward: true });
    await onMessage(forward2);
    assert.deepEqual(deleted(), [forward2.message_id]);

    await setSetting(GROUP.id, 'delAnonMsg', true);
    const anon = groupMsg({ from: { id: 1087968824, username: 'GroupAnonymousBot' }, sender_chat: GROUP, text: 'x' });
    await onMessage(anon);
    assert.deepEqual(deleted(), [forward2.message_id, anon.message_id]);
});

test('缺少删除权限时提示，提示稍后自动删除', async () => {
    await ensureChat(GROUP.id);
    await setSetting(GROUP.id, 'delAnonMsg', true);
    handlers.deleteMessage = () => { throw new BotApiError(400, 'Bad Request: message can\'t be deleted: not enough rights'); };
    await onMessage(groupMsg({ sender_chat: GROUP, text: 'x' }));
    assert.match(sentTexts()[0], /尝试删除消息/);
    const pending = await db.all('SELECT * FROM pending_deletions');
    assert.equal(pending.length, 1);
});

test('/on 需要管理员；非管理员收到提示并在 15 秒后删除', async (t) => {
    let now = 1_000_000;
    t.mock.method(Date, 'now', () => now);

    await onMessage(groupMsg({ from: USER, ...command('/on') }));
    assert.equal((await getChat(GROUP.id)).del, false);
    assert.match(sentTexts()[0], /不是群主或管理员/);
    assert.deepEqual(deleted(), []);

    now += 16_000;
    await onMessage(groupMsg({ text: 'trigger sweep' }));
    assert.equal(deleted().length, 1);

    await onMessage(groupMsg({ from: ADMIN, ...command('/on@TestBot') }));
    assert.equal((await getChat(GROUP.id)).del, true);
});

test('@ 其他机器人的命令不处理', async () => {
    await onMessage(groupMsg({ from: ADMIN, ...command('/on@OtherBot') }));
    assert.equal((await getChat(GROUP.id)).del, false);
    assert.deepEqual(sentTexts(), []);
});

test('自动清理命令：10 秒后删除命令消息', async (t) => {
    let now = 5_000_000;
    t.mock.method(Date, 'now', () => now);
    await ensureChat(GROUP.id);
    await setSetting(GROUP.id, 'delCmd', true);

    const cmd = groupMsg({ from: ADMIN, ...command('/config') });
    await onMessage(cmd);
    assert.ok(!deleted().includes(cmd.message_id));
    now += 9_000;
    await onMessage(groupMsg({ text: 'a' }));
    assert.ok(!deleted().includes(cmd.message_id));
    now += 2_000;
    await onMessage(groupMsg({ text: 'b' }));
    assert.ok(deleted().includes(cmd.message_id));
    // 只删除一次
    await onMessage(groupMsg({ text: 'c' }));
    assert.equal(deleted().filter((id) => id === cmd.message_id).length, 1);
});

test('/promote 与 /demote：回复消息或使用参数', async () => {
    const spam = groupMsg({ sender_chat: CHANNEL, text: 'spam' });
    await onMessage(groupMsg({ from: ADMIN, reply_to_message: spam, ...command('/promote') }));
    assert.ok(await isWhitelisted(GROUP.id, CHANNEL.id));
    assert.match(sentTexts().at(-1), /Spam &lt;channel&gt;/);

    handlers.getChat = ({ chat_id }) => (chat_id === '@spam' ? CHANNEL : { id: 5, type: 'private' });
    await onMessage(groupMsg({ from: ADMIN, ...command('/demote @spam') }));
    assert.ok(!(await isWhitelisted(GROUP.id, CHANNEL.id)));
    assert.match(sentTexts().at(-1), /从白名单中移除/);

    await onMessage(groupMsg({ from: ADMIN, ...command('/demote @spam') }));
    assert.match(sentTexts().at(-1), /不在白名单中/);

    await onMessage(groupMsg({ from: ADMIN, ...command('/promote @user') }));
    assert.match(sentTexts().at(-1), /目标不是频道/);
});

test('/ban 调用 banChatSenderChat', async () => {
    const spam = groupMsg({ sender_chat: CHANNEL, text: 'spam' });
    await onMessage(groupMsg({ from: ADMIN, reply_to_message: spam, ...command('/ban') }));
    assert.deepEqual(callsOf('banChatSenderChat'), [{ chat_id: GROUP.id, sender_chat_id: CHANNEL.id }]);
});

test('设置按钮：开关互斥、白名单移除、非管理员', async () => {
    await ensureChat(GROUP.id);
    const settingsMsg = { message_id: 50, chat: GROUP, date: 0 };
    const press = (data, from = ADMIN) => onCallbackQuery({ id: String(nextId++), from, message: settingsMsg, data });

    await press('deleteChannelMessage');
    assert.equal((await getChat(GROUP.id)).delLinkChanMsg, true);
    await press('unpinChannelMessage');
    let chat = await getChat(GROUP.id);
    assert.equal(chat.unpinChanMsg, true);
    assert.equal(chat.delLinkChanMsg, false);
    await press('deleteChannelMessage');
    chat = await getChat(GROUP.id);
    assert.equal(chat.delLinkChanMsg, true);
    assert.equal(chat.unpinChanMsg, false);

    await press('switch');
    assert.equal((await getChat(GROUP.id)).del, true);
    const keyboard = callsOf('editMessageText').at(-1).reply_markup.inline_keyboard;
    assert.equal(keyboard[0][0].text, '删除频道马甲消息 ✅');

    await addToWhitelist(GROUP.id, CHANNEL.id, CHANNEL.title);
    await press('whitelist');
    assert.equal(callsOf('editMessageText').at(-1).reply_markup.inline_keyboard[0][0].callback_data, `demote_${CHANNEL.id}`);
    await press(`demote_${CHANNEL.id}`);
    assert.deepEqual(await getWhitelist(GROUP.id), []);
    assert.match(callsOf('answerCallbackQuery').at(-1).text, /从白名单中移除/);

    const before = callsOf('editMessageText').length;
    await press('switch', USER);
    assert.equal((await getChat(GROUP.id)).del, true);
    assert.equal(callsOf('editMessageText').length, before);
    assert.equal(callsOf('answerCallbackQuery').at(-1).show_alert, true);
});

test('机器人被移出群组时清理数据', async () => {
    await ensureChat(GROUP.id);
    await addToWhitelist(GROUP.id, CHANNEL.id, CHANNEL.title);
    await onMessage(groupMsg({ left_chat_member: BOT }));
    assert.equal(await getChat(GROUP.id), null);
    assert.deepEqual(await getWhitelist(GROUP.id), []);
});

test('私聊：非命令提示仅限群组，非所有者不能使用所有者命令', async () => {
    await onMessage(privateMsg(USER, { text: 'hello' }));
    await onMessage(privateMsg(USER, command('/backup')));
    assert.deepEqual(sentTexts(), ['请在群组中使用。']);
    assert.deepEqual(callsOf('sendDocument'), []);

    await onMessage(privateMsg(USER, command('/start')));
    assert.match(callsOf('sendMessage').at(-1).reply_markup.inline_keyboard[0][0].url, /t\.me\/TestBot\?startgroup=start/);
});

const LEGACY = {
    [GROUP.id]: { del: true, delCmd: false, delAnonMsg: true, delLinkChanMsg: false, unpinChanMsg: true, whitelist: { [LINKED.id]: '关联 "频道"' } },
    '-1002': { del: true }, // 旧版本留下的缺字段数据
    'undefined': { del: true },
    '-1003': null
};

test('解析旧版 chatsList.json', () => {
    const { chats, entries, skipped } = parseChatsList(JSON.stringify(LEGACY));
    assert.equal(chats.length, 2);
    assert.equal(skipped, 2);
    assert.deepEqual(chats.find((c) => c.chatId === -1002), {
        chatId: -1002, del: true, delCmd: false, delAnonMsg: false, delLinkChanMsg: false, unpinChanMsg: false
    });
    assert.deepEqual(entries, [{ chatId: GROUP.id, channelId: LINKED.id, title: '关联 "频道"' }]);
});

test('/import 导入后 /backup 导出的内容一致', async () => {
    // 已有数据会被覆盖，白名单被替换
    await ensureChat(GROUP.id);
    await addToWhitelist(GROUP.id, CHANNEL.id, CHANNEL.title);

    const file = encodeUtf8(JSON.stringify(LEGACY));
    handlers.getFileContent = () => file;
    await onMessage(privateMsg(OWNER, { document: { file_id: 'f1', file_name: 'chatsList.json' }, caption: '/import', caption_entities: [{ type: 'bot_command', offset: 0, length: 7 }] }));
    assert.match(sentTexts().at(-1), /导入完成：2 个群组，1 条白名单，跳过 2 个无效条目/);

    assert.deepEqual(await getWhitelist(GROUP.id), [{ channelId: LINKED.id, title: '关联 "频道"' }]);
    assert.equal((await getChat(GROUP.id)).unpinChanMsg, true);

    await onMessage(privateMsg(OWNER, command('/backup')));
    const [sent] = callsOf('sendDocument');
    assert.equal(sent.document.filename, 'chatsList.json');
    const exported = JSON.parse(decodeUtf8(sent.document.bytes));
    assert.deepEqual(exported, {
        [GROUP.id]: LEGACY[GROUP.id],
        '-1002': { del: true, delCmd: false, delAnonMsg: false, delLinkChanMsg: false, unpinChanMsg: false, whitelist: {} }
    });
});

test('/import 支持分批写入大量数据，也支持回复文件', async () => {
    const data = {};
    for (let i = 1; i <= 350; i++) {
        const whitelist = {};
        for (let j = 1; j <= 3; j++) whitelist[-100_000 - i * 10 - j] = `c${i}_${j}`;
        data[-1_000_000 - i] = { del: i % 2 === 0, whitelist };
    }
    handlers.getFileContent = () => encodeUtf8(JSON.stringify(data));
    const fileMsg = privateMsg(OWNER, { document: { file_id: 'f2' } });
    await onMessage(privateMsg(OWNER, { reply_to_message: fileMsg, ...command('/import') }));
    assert.match(sentTexts().at(-1), /导入完成：350 个群组，1050 条白名单/);
    assert.equal((await db.get('SELECT count(*) AS n FROM chats')).n, 350);
    assert.equal((await db.get('SELECT count(*) AS n FROM whitelist')).n, 1050);
    assert.equal((await db.get('SELECT count(*) AS n FROM chats WHERE del')).n, 175);
});

test('/import 文件格式错误时报告', async () => {
    handlers.getFileContent = () => encodeUtf8('not json');
    await onMessage(privateMsg(OWNER, { document: { file_id: 'f3' }, caption: '/import' }));
    assert.match(sentTexts().at(-1), /导入失败/);
});

const pressContinue = (from = OWNER) => onCallbackQuery({
    id: String(nextId++), from, data: 'stats_continue',
    message: { message_id: 1, chat: { id: from.id, type: 'private' }, date: 0 }
});
const statsEdits = () => callsOf('editMessageText');
const hasContinueButton = (p) => p.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data === 'stats_continue';

test('/stats 与 /stats members：一次完成，限流后重试，清除失效群组', async () => {
    for (const id of [-11, -12, -13, -14, -15]) await ensureChat(id);
    await setSetting(-12, 'del', true);
    await onMessage(privateMsg(OWNER, command('/stats')));
    assert.match(sentTexts().at(-1), /加入的群组：5 个\n启用的群组：1 个/);

    let limited = true;
    handlers.getChatMemberCount = ({ chat_id }) => {
        if (chat_id === -13) throw new BotApiError(403, 'Forbidden: bot was kicked from the supergroup chat');
        if (chat_id === -15) throw new BotApiError(400, 'Bad Request: something else');
        if (chat_id === -14 && limited) {
            limited = false;
            throw new BotApiError(429, 'Too Many Requests: retry after 0', { retry_after: 0 });
        }
        return 10;
    };
    await onMessage(privateMsg(OWNER, command('/stats members')));
    const edits = statsEdits();
    assert.ok(edits.every((p) => p.message_id === edits[0].message_id));
    assert.match(edits.at(-1).text, /统计群组：5 个\n成员数：30 人\n启用删除马甲消息的群组成员数：10 人\n已清除失效群组：1 个\n获取失败：1 个/);
    assert.ok(!hasContinueButton(edits.at(-1)));
    assert.equal(await getChat(-13), null);
    assert.equal(await db.get("SELECT * FROM kv WHERE key = 'stats_members'"), null);
});

test('/stats members：超出时间预算时暂停，点击按钮在同一条消息中继续', async (t) => {
    for (let i = 1; i <= 30; i++) await ensureChat(-i);
    let now = 0;
    t.mock.method(Date, 'now', () => now);
    // 每次查询耗时 1 秒；每批并发 5 个，一批共计 5 秒
    handlers.getChatMemberCount = () => {
        now += 1_000;
        return 10;
    };

    const sentBefore = callsOf('sendMessage').length;
    await onMessage(privateMsg(OWNER, command('/stats members')));
    assert.deepEqual(callsOf('sendMessage').slice(sentBefore).map((p) => p.text), ['正在统计...']);
    const messageId = statsEdits()[0].message_id;
    let last = statsEdits().at(-1);
    assert.ok(hasContinueButton(last));
    assert.match(last.text, /已统计 33\.33% \(10 \/ 30\)。\n单次运行时间已用完/);
    assert.ok(statsEdits().some((p) => /^统计中 16\.67% \(5 \/ 30\) \.\.\.$/.test(p.text)));

    // 非所有者点击无效
    await pressContinue(USER);
    assert.equal(statsEdits().at(-1), last);

    await pressContinue();
    assert.match(statsEdits().at(-1).text, /\(20 \/ 30\)/);
    // 也可以发送命令继续
    await onMessage(privateMsg(OWNER, command('/stats members')));
    last = statsEdits().at(-1);
    assert.match(last.text, /统计群组：30 个\n成员数：300 人/);
    assert.ok(statsEdits().every((p) => p.message_id === messageId));
    assert.equal(callsOf('getChatMemberCount').length, 30);

    await pressContinue();
    assert.equal(callsOf('answerCallbackQuery').at(-1).text, '没有进行中的统计');
});

test('/stats members：限流等待超出预算时暂停，继续后不重复计数', async (t) => {
    for (let i = 1; i <= 7; i++) await ensureChat(-i);
    let now = 0;
    t.mock.method(Date, 'now', () => now);
    let limited = true;
    handlers.getChatMemberCount = ({ chat_id }) => {
        if (chat_id === -5 && limited) {
            limited = false;
            throw new BotApiError(429, 'Too Many Requests: retry after 30', { retry_after: 30 });
        }
        return chat_id === -1 ? 1 : 10;
    };
    await onMessage(privateMsg(OWNER, command('/stats members')));
    const paused = statsEdits().at(-1);
    assert.ok(hasContinueButton(paused));
    assert.match(paused.text, /\(4 \/ 7\)。\n被 Telegram 限流，请在 30 秒后/);

    now += 31_000;
    await pressContinue();
    assert.match(statsEdits().at(-1).text, /统计群组：7 个\n成员数：61 人/);
});

test('/stats members：统计进行中时不能重复开始', async (t) => {
    await ensureChat(-1);
    let now = 0;
    t.mock.method(Date, 'now', () => now);
    let release;
    handlers.getChatMemberCount = () => new Promise((resolve) => { release = () => resolve(10); });

    const first = onMessage(privateMsg(OWNER, command('/stats members')));
    while (!release) await new Promise((r) => setImmediate(r));
    await onMessage(privateMsg(OWNER, command('/stats members')));
    assert.equal(sentTexts().at(-1), '统计正在进行中');
    await pressContinue();
    assert.equal(callsOf('answerCallbackQuery').at(-1).text, '统计正在进行中');

    release();
    await first;
    assert.match(statsEdits().at(-1).text, /统计群组：1 个/);
});

test('UTF-8 编解码的后备实现', () => {
    const { TextEncoder: TE, TextDecoder: TD } = globalThis;
    try {
        delete globalThis.TextEncoder;
        delete globalThis.TextDecoder;
        const s = '反频道马甲 🎉 "<x>"';
        const bytes = encodeUtf8(s);
        assert.deepEqual([...bytes], [...new TE().encode(s)]);
        assert.equal(decodeUtf8(bytes), s);
    }
    finally {
        globalThis.TextEncoder = TE;
        globalThis.TextDecoder = TD;
    }
});
