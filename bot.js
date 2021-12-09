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
 */
var chatsList = fs.existsSync('chatsList.json') ? JSON.parse(fs.readFileSync('chatsList.json')) : {};

/**
 * 根据群聊的设置，生成 Inline Keyboard 的文本
 * @param {number} chatId 聊天 ID
 * @returns {Array<object>} Inline Keyboard
 */
function generateKeyboard(chatId) {
    var keyboard = [];
    keyboard.push([{ text: '服务状态：' + (chatsList[chatId].delete ? '开启' : '关闭'), callback_data: 'switch' }]);
    keyboard.push([{ text: '删除群管匿名发送的消息：' + (chatsList[chatId].deleteAnonymousMessage ? '✅' : '❌'), callback_data: 'deleteAnonymousMessage' }]);
    keyboard.push([{ text: '删除来自关联频道的消息：' + (chatsList[chatId].deleteChannelMessage ? '✅' : '❌'), callback_data: 'deleteChannelMessage' }]);
    keyboard.push([{ text: '删除此消息', callback_data: 'deleteMsg' }]);
    return keyboard;
}

function deleteMessage(msg, alertOnFailure) {
    bot.deleteMessage(msg.chat.id, msg.message_id).catch(() => {
        if (alertOnFailure)
            bot.sendMessage(msg.chat.id, '尝试删除失败，我没有删除消息的权限。', { reply_to_message_id: msg.message_id });
    });
}

bot.on('message', (msg) => {
    console.log(msg);
    const chatId = msg.chat.id;
    if (msg.chat.type == 'group' || msg.chat.type == 'supergroup')
        chatsList[chatId] ? null : chatsList[chatId] = {};
    if (msg.chat.type == 'private') {
        if (msg.from.id == config.admin) {
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
    if (msg.text) {
        switch (msg.text) {
            case '/start':
                bot.sendMessage(chatId, '欢迎，请在群组中使用。');
                break;
            case '/on':
            case '/on@AntiChannelSpammersBot':
                bot.getChatMember(chatId, msg.from.id).then(function (result) {
                    if (result.status == 'creator' || result.status == 'administrator' || result.user.username == 'GroupAnonymousBot') {
                        chatsList[chatId].delete = true;
                        fs.writeFileSync('chatsList.json', JSON.stringify(chatsList));
                        bot.sendMessage(chatId, '已在本群启用自动删除频道马甲发送的消息。\n\n您需要将我设置为管理员，并分配删除消息的权限。您可以发送 /config 查看相关设置。');
                    }
                    else
                        bot.sendMessage(chatId, '<a href="tg://user?id=' + msg.from.id + '">您</a>不是群主或管理员。', { parse_mode: 'HTML' });
                    deleteMessage(msg, false);
                });
                break;
            case '/off':
            case '/off@AntiChannelSpammersBot':
                bot.getChatMember(chatId, msg.from.id).then(function (result) {
                    if (result.status == 'creator' || result.status == 'administrator' || result.user.username == 'GroupAnonymousBot') {
                        chatsList[chatId].delete = false;
                        fs.writeFileSync('chatsList.json', JSON.stringify(chatsList));
                        bot.sendMessage(chatId, '已停止自动删除频道马甲发送的消息。');
                    }
                    else
                        bot.sendMessage(chatId, '<a href="tg://user?id=' + msg.from.id + '">您</a>不是群主或管理员。', { parse_mode: 'HTML' });
                    deleteMessage(msg, false);
                });
                break;
            case '/config':
            case '/config@AntiChannelSpammersBot':
                bot.getChatMember(chatId, msg.from.id).then(function (result) {
                    if (result.status == 'creator' || result.status == 'administrator' || result.user.username == 'GroupAnonymousBot') {
                        bot.sendMessage(chatId, '⚙️ 设置', {
                            reply_markup: {
                                inline_keyboard: generateKeyboard(chatId)
                            }
                        });
                    }
                    else
                        bot.sendMessage(chatId, '<a href="https://t.me/user?id=' + msg.from.id + '">您</a>不是群主或管理员。', { parse_mode: 'HTML' });
                    deleteMessage(msg, false);
                });
            default:
                break;
        }
    }
    if (msg.from.id == 777000) { // 频道身份的消息，也可以用 sender_chat
        if (msg.is_automatic_forward) { // 关联频道转过来的消息
            chatsList[chatId].deleteChannelMessage ? deleteMessage(msg, true) : null;
        }
        else { // 频道马甲发送的消息
            chatsList[chatId].delete ? deleteMessage(msg, true) : null;
        }
    }
    else if (msg.from.username && msg.from.username == 'GroupAnonymousBot') { // 匿名管理发送的消息
        chatsList[chatId].deleteAnonymousMessage ? deleteMessage(msg, true) : null;
    }
});

bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    // console.log(query);
    if (query.message.chat.type == 'group' || query.message.chat.type == 'supergroup')
        chatsList[chatId] ? null : chatsList[chatId] = {};
    bot.getChatMember(query.message.chat.id, query.from.id).then(function (result) {
        if (result.status == 'creator' || result.status == 'administrator' || result.user.username == 'GroupAnonymousBot') { // 管理员
            switch (query.data) {
                case 'switch':
                    chatsList[chatId].delete = !chatsList[chatId].delete;
                    bot.answerCallbackQuery(query.id, { text: '已' + (chatsList[chatId].delete ? '启用' : '停用') + '。', show_alert: true });
                    break;
                case 'deleteAnonymousMessage':
                    chatsList[chatId].deleteAnonymousMessage = !chatsList[chatId].deleteAnonymousMessage;
                    bot.answerCallbackQuery(query.id, { text: '已' + (chatsList[chatId].deleteAnonymousMessage ? '启用' : '停用') + '自动删除群管匿名发送的消息。', show_alert: true });
                    break;
                case 'deleteChannelMessage':
                    chatsList[chatId].deleteChannelMessage = !chatsList[chatId].deleteChannelMessage;
                    bot.answerCallbackQuery(query.id, { text: '已' + (chatsList[chatId].deleteChannelMessage ? '启用' : '停用') + '自动删除来自关联频道的消息。', show_alert: true });
                    break;
                case 'deleteMsg':
                    bot.deleteMessage(chatId, query.message.message_id);
                    return;
                default:
                    break;
            }
            fs.writeFileSync('chatsList.json', JSON.stringify(chatsList));
            bot.editMessageText('⚙️ 设置', { chat_id: chatId, message_id: query.message.message_id, reply_markup: { inline_keyboard: generateKeyboard(chatId) } });
        }
        else { bot.answerCallbackQuery(query.id, { text: '您不是群主或管理员，再点我要摇人啦！', show_alert: true }); return; }
    });
});