const TelegramBot = require('node-telegram-bot-api');
const config = require('./config.json');
const fs = require('fs');
const express = require('express');
const bot = new TelegramBot(config.token);
const app = express();
if (config.webhookUrl) {
    bot.setWebHook(`${config.webhookUrl}${config.token}`);
    app.use(express.json());
    app.post(`/${config.token}`, (req, res) => {
        bot.processUpdate(req.body);
        res.sendStatus(200);
    });
    app.listen(2468, () => {
        console.log(`Express server is listening on 2468`);
    });
}
else bot.startPolling();

/**
 * 目前的属性列表：
 * @property {boolean} delete 是否开启删除功能 
 * @property {boolean} deleteAnonymousMessage 是否删除匿名发送的消息
 * @property {boolean} deleteChannelMessage 是否删除来自关联频道的消息
 * @property {array} whitelist 白名单
 */
var chatsList = fs.existsSync('chatsList.json') ? JSON.parse(fs.readFileSync('chatsList.json')) : {};

/**
 * 根据群聊的设置，生成 Inline Keyboard 的文本
 * @param {number} chatId 聊天 ID
 * @param {boolean} isWhitelist 是否是白名单
 * @returns {Array<object>} Inline Keyboard
 */
function generateKeyboard(chatId, isWhitelist) {
    var keyboard = [];
    if (isWhitelist) {
        let whitelist = chatsList[chatId].whitelist || [];
        for (let channel of whitelist)
            keyboard.push([{ text: channel, callback_data: 'demote_' + channel }]);
        keyboard.push([{ text: '🔙 返回', callback_data: 'back' }]);
    }
    else {
        keyboard.push([{ text: '删除频道马甲发送的消息：' + (chatsList[chatId].delete ? '✅' : '❌'), callback_data: 'switch' }]);
        keyboard.push([{ text: '删除群管匿名发送的消息：' + (chatsList[chatId].deleteAnonymousMessage ? '✅' : '❌'), callback_data: 'deleteAnonymousMessage' }]);
        keyboard.push([{ text: '删除来自关联频道的消息：' + (chatsList[chatId].deleteChannelMessage ? '✅' : '❌'), callback_data: 'deleteChannelMessage' }]);
        keyboard.push([{ text: '频道白名单', callback_data: 'whitelist' }]);
        keyboard.push([{ text: '删除此消息', callback_data: 'deleteMsg' }]);
    }
    return keyboard;
}

function deleteMessage(msg, alertOnFailure) {
    bot.deleteMessage(msg.chat.id, msg.message_id).catch(() => {
        if (alertOnFailure)
            bot.sendMessage(msg.chat.id, '尝试删除消息（ID ' + msg.message_id + '）失败！可能是我没有删除消息的权限，或者消息已被删除。');
    });
}

function saveData() { fs.writeFileSync('chatsList.json', JSON.stringify(chatsList)); }

bot.on('message', (msg) => {
    var chatId = msg.chat.id;
    var fromId = msg.from.id;
    if (msg.chat.type == 'private') {
        if (fromId == config.admin) {
            if (msg.text == '/stats') {
                let count = 0;
                for (let key in chatsList)
                    if (chatsList[key].delete) count++;
                bot.sendMessage(chatId, '被拉入过的群组：{g} 个\n启用功能的群组：{e} 个'.replace('{g}', Object.keys(chatsList).length).replace('{e}', count));
            }
        }
        else
            bot.sendMessage(msg.chat.id, '请在群组中使用。');
        return;
    }
    else if (msg.chat.type == 'group' || msg.chat.type == 'supergroup') {
        chatsList[chatId] ? null : chatsList[chatId] = {};
        if (msg.new_chat_members)
            for (let x in msg.new_chat_members) {
                if (msg.new_chat_members[x].username == config.bot) {
                    bot.sendMessage(chatId, '欢迎使用！您可以发送 /on 或 /off 一键开启和关闭服务，或者发送 /config 进行详细的设置。');
                    if (chatsList[chatId] == undefined) chatsList[chatId] = {};
                }
            }
        else if (msg.left_chat_member && msg.left_chat_member.username == config.bot) {
            delete chatsList[chatId];
            console.log('群组 ' + chatId + ' 已被移除。');
            saveData();
            return;
        }
        if (msg.text) {
            switch (msg.text) {
                case '/start':
                    bot.sendMessage(chatId, '欢迎，请在群组中使用。');
                    break;
                case '/on':
                case '/on@' + config.bot:
                    bot.getChatMember(chatId, fromId).then(function (result) {
                        if (result.status == 'creator' || result.status == 'administrator' || result.user.username == 'GroupAnonymousBot') {
                            chatsList[chatId].delete = true;
                            bot.sendMessage(chatId, '已在本群启用自动删除频道马甲发送的消息。\n\n您需要将我设置为管理员，并分配删除消息的权限。您可以发送 /config 查看相关设置，发送 /help 查看功能帮助。');
                            saveData();
                        }
                        else
                            bot.sendMessage(chatId, '<a href="tg://user?id=' + fromId + '">您</a>不是群主或管理员。', { parse_mode: 'HTML' });
                        deleteMessage(msg, false);
                    });
                    break;
                case '/off':
                case '/off@' + config.bot:
                    bot.getChatMember(chatId, fromId).then(function (result) {
                        if (result.status == 'creator' || result.status == 'administrator' || result.user.username == 'GroupAnonymousBot') {
                            chatsList[chatId].delete = false;
                            bot.sendMessage(chatId, '已停止自动删除频道马甲发送的消息。其它设置项未变，您可以在 /config 设置中更改。');
                            saveData();
                        }
                        else
                            bot.sendMessage(chatId, '<a href="tg://user?id=' + fromId + '">您</a>不是群主或管理员。', { parse_mode: 'HTML' });
                        deleteMessage(msg, false);
                    });
                    break;
                case '/config':
                case '/config@' + config.bot:
                    bot.getChatMember(chatId, fromId).then(function (result) {
                        if (result.status == 'creator' || result.status == 'administrator' || result.user.username == 'GroupAnonymousBot') {
                            bot.sendMessage(chatId, '<b>⚙️ 设置</b>', {
                                parse_mode: 'HTML',
                                reply_markup: {
                                    inline_keyboard: generateKeyboard(chatId)
                                }
                            });
                        }
                        else
                            bot.sendMessage(chatId, '<a href="https://t.me/user?id=' + fromId + '">您</a>不是群主或管理员。', { parse_mode: 'HTML' });
                        deleteMessage(msg, false);
                    });
                    break;
                case '/help':
                case '/help@' + config.bot:
                    bot.sendMessage(chatId, '<b>帮助</b>\n\n<b> - /on:</b> 启用全局服务\n<b> - /off:</b> 关闭全局服务\n<b> - /promote:</b> 回复一个频道发送的信息，将其添加到白名单。也可以单独发送 <code>/promote [频道 ID]</code> 来授权。\n<b> - /demote:</b> 回复一条频道发送的信息，将其移出白名单。也可以单独发送 <code>/demote [频道 ID]</code> 来移出。\n<b> - /config:</b> 显示此群组的配置：\n    - 开关 “删除频道马甲的消息”；\n    - 开关 “删除群管匿名发送的消息”；\n    - 开关 “删除来自关联频道的消息”；\n    - 查看和编辑白名单\n\n本机器人基于 GPLv3 协议开源，源码发布于 <a href="https://github.com/AnotiaWang/AntiChannelSpammersBot">GitHub</a>。', { parse_mode: 'HTML', disable_web_page_preview: true });
                    deleteMessage(msg, false);
                    break;
                default:
                    break;
            }
            if (msg.text.startsWith('/promote') || msg.text.startsWith('/demote')) {
                bot.getChatMember(chatId, fromId).then(function (result) {
                    if (result.status == 'creator' || result.status == 'administrator' || result.user.username == 'GroupAnonymousBot') {
                        let promote = msg.text.startsWith('/promote') ? true : false;
                        let text = '', oprChatId;
                        chatsList[chatId].whitelist = chatsList[chatId].whitelist || [];
                        // 如果是用户，则提示身份不对；如果有参数，则添加参数；如果是回复一条消息，则判断是不是chat，不是则报错
                        if (msg.reply_to_message) {
                            if (msg.reply_to_message.sender_chat) {
                                oprChatId = '' + msg.reply_to_message.sender_chat.id;
                                let canOperate = promote ? (!chatsList[chatId].whitelist.includes(oprChatId)) : chatsList[chatId].whitelist.includes(oprChatId);
                                if (canOperate) {
                                    text = '已将该频道 ({c}) ' + (promote ? '添加到白名单中。' : '从白名单中移除。');
                                    promote ? chatsList[chatId].whitelist.push(oprChatId) : chatsList[chatId].whitelist.splice(chatsList[chatId].whitelist.indexOf(oprChatId), 1);
                                }
                                else
                                    text = '该频道' + (promote ? '已' : '不') + '在白名单中。';
                            }
                            else text = '被回复的用户不是频道，无法' + (promote ? '添加。' : '移除。');
                        }
                        else {
                            let args = msg.text.split(' ');
                            if (args.length == 2) {
                                oprChatId = args[1];
                                let canOperate = promote ? (!chatsList[chatId].whitelist.includes(oprChatId)) : chatsList[chatId].whitelist.includes(oprChatId);
                                if (canOperate) {
                                    text = '已将该频道 ({c}) ' + (promote ? '添加到白名单中。' : '从白名单中移除。');
                                    chatsList[chatId].whitelist.push(oprChatId);
                                }
                                else
                                    text = '该频道' + (promote ? '已' : '不') + '在白名单中。';
                            }
                            else text = '请回复一条消息，或者使用 ' + (promote ? '/promote' : '/demote') + ' [频道 ID] 来' + (promote ? '添加' : '移除') + '频道。';
                        }
                        bot.sendMessage(chatId, text.replace('{c}', oprChatId), { parse_mode: 'HTML' });
                        saveData();
                    }
                    else
                        bot.sendMessage(chatId, '<a href="tg://user?id=' + fromId + '">您</a>不是群主或管理员。', { parse_mode: 'HTML' });
                    deleteMessage(msg, false);
                });
            }
        }
        if (msg.sender_chat) {
            if (chatsList[chatId].whitelist && chatsList[chatId].whitelist.includes(msg.sender_chat.id))
                return;
            if (msg.from.username == 'Channel_Bot') { // 频道身份的消息，也可以用 sender_chat
                if (msg.is_automatic_forward)  // 关联频道转过来的消息
                    chatsList[chatId].deleteChannelMessage ? deleteMessage(msg, true) : null;
                else  // 频道马甲发送的消息
                    chatsList[chatId].delete ? deleteMessage(msg, true) : null;
            }
            else if (msg.from.username && msg.from.username == 'GroupAnonymousBot')  // 匿名管理发送的消息
                chatsList[chatId].deleteAnonymousMessage ? deleteMessage(msg, true) : null;
        }
    }
});

bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    if (query.message.chat.type == 'group' || query.message.chat.type == 'supergroup')
        chatsList[chatId] ? null : chatsList[chatId] = {};
    bot.getChatMember(query.message.chat.id, query.from.id).then(function (result) {
        if (result.status == 'creator' || result.status == 'administrator' || result.user.username == 'GroupAnonymousBot') { // 管理员
            let text = '<b>⚙️ 设置</b>', isWhitelist = false;
            switch (query.data) {
                case 'switch':
                    chatsList[chatId].delete = !chatsList[chatId].delete;
                    bot.answerCallbackQuery(query.id, { text: '已' + (chatsList[chatId].delete ? '启用' : '停用') + '自动删除频道马甲消息。', show_alert: true });
                    break;
                case 'deleteAnonymousMessage':
                    chatsList[chatId].deleteAnonymousMessage = !chatsList[chatId].deleteAnonymousMessage;
                    bot.answerCallbackQuery(query.id, { text: '已' + (chatsList[chatId].deleteAnonymousMessage ? '启用' : '停用') + '自动删除匿名群管的消息。', show_alert: true });
                    break;
                case 'deleteChannelMessage':
                    chatsList[chatId].deleteChannelMessage = !chatsList[chatId].deleteChannelMessage;
                    bot.answerCallbackQuery(query.id, { text: '已' + (chatsList[chatId].deleteChannelMessage ? '启用' : '停用') + '自动删除来自关联频道的消息。', show_alert: true });
                    break;
                case 'deleteMsg':
                    bot.deleteMessage(chatId, query.message.message_id);
                    return;
                case 'whitelist':
                    text = '<b>白名单</b>\n\n点击按钮取消对应频道的授权。详细的用法请发送 /help 查看。';
                    isWhitelist = true;
                    break;
                default:
                    break;
            }
            if (query.data.startsWith('demote')) {
                bot.answerCallbackQuery(query.id, { text: '已取消对应频道的授权。', show_alert: false });
                let demoteChatId = query.data.split('_')[1];
                chatsList[chatId].whitelist.splice(chatsList[chatId].whitelist.indexOf(demoteChatId), 1);
                text = '<b>白名单</b>\n\n点击按钮取消对应频道的授权。详细的用法请发送 /help 查看。';
                isWhitelist = true;
            }
            saveData();
            bot.editMessageText(text, { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'HTML', reply_markup: { inline_keyboard: generateKeyboard(chatId, isWhitelist) } });
        }
        else
            bot.answerCallbackQuery(query.id, { text: '您不是群主或管理员，再点我要摇人啦！', show_alert: true });
    });
});