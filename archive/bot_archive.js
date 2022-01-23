const TelegramBot = require('node-telegram-bot-api');
const config = require('./config.json');
const strings = require('./strings.json');
const fs = require('fs');
const express = require('express');
const bot = new TelegramBot(config.token);
const app = express();

if (config.webhookUrl) {
    bot.setWebHook(`${config.webhookUrl}bot${config.token}`);
    app.use(express.json());
    app.post(`/bot${config.token}`, (req, res) => {
        bot.processUpdate(req.body);
        res.sendStatus(200);
    });
    app.get('/stats', (req, res) => {
        res.send({
            "schemaVersion": 1,
            "label": "使用中群组",
            "message": getActiveGroupsCount().toString() + ' 个',
            "color": "#26A5E4",
            "namedLogo": "Telegram",
            "style": "flat"
        });
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
 * @property {object} whitelist 白名单
 * @property {boolean} unpinChannelMessage 自动解除频道消息在群组的置顶
 */
var chatsList = fs.existsSync('chatsList.json') ? JSON.parse(fs.readFileSync('chatsList.json')) : {};

/**
 * 根据群聊的设置，生成 Inline Keyboard 的文本
 * @param {number} chatId 聊天 ID
 * @param {boolean} isWhitelist 是否是白名单
 * @returns {Array<Array<object>>} Inline Keyboard
 */
function generateKeyboard(chatId, isWhitelist) {
    var keyboard = [];
    if (isWhitelist) {
        let whitelist = chatsList[chatId].whitelist || {};
        for (let channel in whitelist)
            keyboard.push([{ text: chatsList[chatId].whitelist[channel], callback_data: 'demote_' + channel }]);
        if (Object.keys(whitelist).length == 0)
            keyboard.push([{ text: '（当前无白名单）🔙 返回', callback_data: 'back' }]);
        else
            keyboard.push([{ text: '🔙 返回', callback_data: 'back' }]);
    }
    else {
        keyboard.push([{ text: '删除频道马甲消息：' + (chatsList[chatId].delete ? '✅' : '❌'), callback_data: 'switch' }]);
        keyboard.push([{ text: '删除匿名管理消息：' + (chatsList[chatId].deleteAnonymousMessage ? '✅' : '❌'), callback_data: 'deleteAnonymousMessage' }]);
        keyboard.push([{ text: '删除来自关联频道的消息：' + (chatsList[chatId].deleteChannelMessage ? '✅' : '❌'), callback_data: 'deleteChannelMessage' }]);
        keyboard.push([{ text: '解除频道消息在群内置顶：' + (chatsList[chatId].unpinChannelMessage ? '✅' : '❌'), callback_data: 'unpinChannelMessage' }])
        keyboard.push([{ text: '频道白名单', callback_data: 'whitelist' }]);
        keyboard.push([{ text: '删除此消息', callback_data: 'deleteMsg' }]);
    }
    return keyboard;
}

function deleteMessage(msg, alertOnFailure) {
    bot.deleteMessage(msg.chat.id, msg.message_id).catch((err) => {
        if (alertOnFailure) {
            bot.sendMessage(msg.chat.id, '尝试删除消息 (ID ' + msg.message_id + ') 失败！可能是我没有删除消息的权限，或者消息已被删除。(15 秒后自毁)').then((cb) => delayDeleteMessage(cb, 15000));
        }
    });
}

async function getChatMembersCount(editMsgId) {
    let activeCount = 0, totalCount = 0, i = 0;
    let interval = setInterval(() => {
        bot.editMessageText('统计中 ' + (i / Object.keys(chatsList).length * 100).toFixed(2) + '% ...', {
            chat_id: config.admin,
            message_id: editMsgId
        }).catch(() => { });
    }, 3000);
    let chatIds = Object.keys(chatsList);
    while (chatIds.length > 0) {
        let chat = chatIds.shift();
        try {
            let cb = await bot.getChatMemberCount(chat);
            i++;
            totalCount += cb;
            if (chatsList[chat].delete)
                activeCount += cb;
        }
        catch (err) {
            if (err.message.includes('kicked') || err.message.includes('not found') || err.message.includes('upgraded')) {
                console.log('删除 ' + chat);
                delete chatsList[chat];
                saveData();
            }
            else if (err.message.includes('429 Too Many Requests'))
                chatIds.push(chat);
        }
    }
    clearInterval(interval);
    return [totalCount, activeCount];
}

function delayDeleteMessage(msg, delay) {
    setTimeout(() => {
        bot.deleteMessage(msg.chat.id, msg.message_id).catch((err) => { });
    }, delay);
}

// 判断一个用户是不是群组的管理员
function isAdmin(searchResult) {
    if (searchResult.status == 'creator' || searchResult.status == 'administrator' || searchResult.user.username == 'GroupAnonymousBot')
        return true;
    else return false;
}

function getActiveGroupsCount() {
    let count = 0;
    for (let key in chatsList)
        if (chatsList[key].delete) count++;
    return count;
}

function saveData() { fs.writeFileSync('chatsList.json', JSON.stringify(chatsList)); }

bot.on('message', (msg) => {
    var chatId = msg.chat.id;
    var fromId = msg.from.id;
    // 私聊部分，可用的命令很少
    if (msg.chat.type == 'private') {
        if (fromId == config.admin) {
            if (msg.text == '/stats') {
                bot.sendMessage(config.admin, '统计中...').then((cb) => {
                    let editMsgId = cb.message_id;
                    getChatMembersCount(cb.message_id).then((userCount) => {
                        bot.editMessageText(strings.stats.replace('{g}', Object.keys(chatsList).length).replace('{e}', getActiveGroupsCount()).replace('{u1}', userCount[0]).replace('{u2}', userCount[1]), { chat_id: config.admin, message_id: editMsgId });
                    });
                });
                return;
            }
        }
        if (msg.text == '/start')
            bot.sendMessage(chatId, strings.welcome_private, {
                parse_mode: 'HTML',
                disable_web_page_preview: true,
                reply_markup: {
                    inline_keyboard: [[{ text: strings.add_to_group, url: 'https://telegram.me/' + config.bot + '?startgroup=true' }]]
                }
            });
        else if (msg.text == '/help')
            bot.sendMessage(chatId, strings.help, { parse_mode: 'HTML', disable_web_page_preview: true });
        else
            bot.sendMessage(chatId, strings.group_only);
        return;
    }
    // 群组部分
    else if (msg.chat.type == 'group' || msg.chat.type == 'supergroup') {
        chatsList[chatId] ? null : chatsList[chatId] = {};
        // 机器人被拉进群组
        if (msg.new_chat_members)
            for (let x in msg.new_chat_members) {
                if (msg.new_chat_members[x].username == config.bot) {
                    bot.sendMessage(chatId, strings.welcome_group);
                    if (!chatsList[chatId])
                        chatsList[chatId] = {};
                }
            }
        // // 机器人被踢出群组，清理配置文件
        else if (msg.left_chat_member && msg.left_chat_member.username == config.bot) {
            delete chatsList[chatId];
            console.log('群组 ' + chatId + ' 已被移除。');
            saveData();
            return;
        }
        // 调整群组的功能设置
        if (msg.text) {
            switch (msg.text) {
                case '/start':
                case '/start@' + config.bot:
                    bot.sendMessage(chatId, strings.welcome_group);
                    break;
                case '/on': // 开启功能
                case '/on@' + config.bot:
                    bot.getChatMember(chatId, fromId).then(function (result) {
                        if (isAdmin(result)) {
                            chatsList[chatId].delete = true;
                            bot.sendMessage(chatId, strings.del_channel_message_on);
                            saveData();
                        }
                        else
                            bot.sendMessage(chatId, strings.operator_not_admin.replace('{id}', fromId), { parse_mode: 'HTML' })
                                .then((cb) => delayDeleteMessage(cb, 5000));
                        deleteMessage(msg, false);
                    });
                    break;
                case '/off': // 关闭功能
                case '/off@' + config.bot:
                    bot.getChatMember(chatId, fromId).then(function (result) {
                        if (isAdmin(result)) {
                            chatsList[chatId].delete = false;
                            bot.sendMessage(chatId, strings.del_channel_message_off);
                            saveData();
                        }
                        else
                            bot.sendMessage(chatId, strings.operator_not_admin.replace('{id}', fromId), { parse_mode: 'HTML' })
                                .then((cb) => delayDeleteMessage(cb, 5000));
                        deleteMessage(msg, false);
                    });
                    break;
                case '/config': // 显示群组相关配置
                case '/config@' + config.bot:
                    bot.getChatMember(chatId, fromId).then(function (result) {
                        if (isAdmin(result)) {
                            bot.sendMessage(chatId, '<b>⚙️ 设置</b>', {
                                parse_mode: 'HTML',
                                reply_markup: {
                                    inline_keyboard: generateKeyboard(chatId)
                                }
                            });
                        }
                        else
                            bot.sendMessage(chatId, strings.operator_not_admin.replace('{id}', fromId), { parse_mode: 'HTML' })
                                .then((cb) => delayDeleteMessage(cb, 5000));
                        deleteMessage(msg, false);
                    });
                    break;
                case '/help': // 显示帮助信息
                case '/help@' + config.bot:
                    bot.getChatMember(chatId, fromId).then(function (result) {
                        if (isAdmin(result))
                            bot.sendMessage(chatId, strings.help, {
                                parse_mode: 'HTML',
                                disable_web_page_preview: true,
                                reply_markup: {
                                    inline_keyboard: [[{ text: '删除此消息', callback_data: 'deleteMsg' }]]
                                }
                            });
                        else
                            bot.sendMessage(chatId, strings.operator_not_admin.replace('{id}', fromId), { parse_mode: 'HTML' })
                                .then((cb) => delayDeleteMessage(cb, 5000));
                    });
                    deleteMessage(msg, false);
                    break;
                case '/ban':
                case '/ban@' + config.bot:
                case '/unban':
                case '/unban@' + config.bot:
                    let isBan = msg.text.indexOf('/ban') == 0;
                    bot.getChatMember(chatId, fromId).then(function (result) {
                        if (isAdmin(result)) {
                            if (msg.reply_to_message && msg.reply_to_message.sender_chat) {
                                let oprChatId = msg.reply_to_message.sender_chat.id;
                                if (isBan)
                                    bot.banChatSenderChat(chatId, oprChatId)
                                        .then((cb) => {
                                            if (cb)
                                                bot.sendMessage(chatId, strings.ban_sender_chat_success.replace('{id}', oprChatId), { parse_mode: 'HTML' });
                                        })
                                        .catch((err) => {
                                            if (err.message.includes('not enough rights'))
                                                bot.sendMessage(chatId, strings.permission_error.replace(/{x}/g, '封禁频道'))
                                                    .then((cb) => delayDeleteMessage(cb, 15000));;
                                        });
                                else
                                    bot.unbanChatSenderChat(chatId, oprChatId)
                                        .then((cb) => {
                                            if (cb)
                                                bot.sendMessage(chatId, strings.unban_sender_chat_success.replace('{id}', oprChatId), { parse_mode: 'HTML' });
                                        })
                                        .catch((err) => {
                                            if (err.message.includes('not enough rights'))
                                                bot.sendMessage(chatId, strings.permission_error.replace(/{x}/g, '解封频道'))
                                                    .then((cb) => delayDeleteMessage(cb, 15000));;
                                        });
                            }
                            else
                                bot.sendMessage(chatId, strings.reply_to_query)
                                    .then((cb) => delayDeleteMessage(cb, 15000));
                        }
                        else {
                            bot.sendMessage(chatId, strings.operator_not_admin.replace('{id}', fromId), { parse_mode: 'HTML' })
                                .then((cb) => delayDeleteMessage(cb, 5000));
                        }
                    });
                    deleteMessage(msg, false);
                    break;
                default:
                    break;
            }
            if (msg.text.startsWith('/promote') || msg.text.startsWith('/demote')) {
                bot.getChatMember(chatId, fromId).then(function (result) {
                    if (isAdmin(result)) {
                        let isPromote = msg.text.startsWith('/promote') ? true : false;
                        let queryChat, oprChatId;
                        chatsList[chatId].whitelist = chatsList[chatId].whitelist || {};
                        // 如果回复消息，则查询被回复消息的发送者
                        if (msg.reply_to_message) {
                            if (msg.reply_to_message.sender_chat)
                                queryChat = '' + msg.reply_to_message.sender_chat.id;
                            else {
                                bot.sendMessage(chatId, strings.x_not_a_channel);
                                return;
                            }
                        }
                        // 分割出命令中的参数
                        else {
                            let args = msg.text.split(' ');
                            if (args.length == 2)
                                queryChat = args[1];
                            else {
                                bot.sendMessage(chatId, '请回复一条消息，或者使用 ' + (isPromote ? '/promote' : '/demote') + ' [频道 UID/username] 来' + (isPromote ? '添加' : '移除') + '频道。');
                                return;
                            }
                        }
                        // 查询
                        bot.getChat(queryChat).then(function (result) {
                            if (result.type != 'channel') // 防止误操作
                                throw new Error('Not a Channel');
                            oprChatId = result.id.toString();
                            //  白名单中是否已有该频道，是否可以进一步操作
                            let canOperate = (!chatsList[chatId].whitelist[oprChatId] && isPromote) || (chatsList[chatId].whitelist[oprChatId] && !isPromote);
                            if (canOperate) {
                                if (isPromote) {
                                    chatsList[chatId].whitelist[oprChatId] = result.title;
                                    bot.sendMessage(chatId, strings.x_added_to_whitelist.replace('{x}', result.title).replace('{id}', oprChatId));
                                }
                                else {
                                    delete chatsList[chatId].whitelist[oprChatId];
                                    bot.sendMessage(chatId, strings.x_removed_from_whitelist.replace('{x}', result.title).replace('{id}', oprChatId));
                                }
                                saveData();
                            }
                            else {
                                bot.sendMessage(chatId, isPromote ? strings.x_already_in_whitelist : strings.x_not_in_whitelist)
                                    .then((cb) => delayDeleteMessage(cb, 15000));
                            }
                        }).catch(() => {
                            bot.sendMessage(chatId, strings.get_channel_error, { parse_mode: 'HTML' })
                                .then((cb) => delayDeleteMessage(cb, 15000));
                        });
                    }
                    else
                        bot.sendMessage(chatId, strings.operator_not_admin.replace('{id}', fromId), { parse_mode: 'HTML' })
                            .then((cb) => delayDeleteMessage(cb, 5000));
                    deleteMessage(msg, false);
                });
            }
        }
        // 清理消息部分
        if (msg.sender_chat) {
            if (chatsList[chatId].whitelist && chatsList[chatId].whitelist[msg.sender_chat.id.toString()])
                return;
            if (msg.sender_chat.type == 'channel') { // 频道身份的消息，也可以用 sender_chat
                if (msg.is_automatic_forward)  // 关联频道转过来的消息
                {
                    if (chatsList[chatId].deleteChannelMessage)
                        deleteMessage(msg, true);
                    else if (chatsList[chatId].unpinChannelMessage)
                        bot.unpinChatMessage(chatId, { message_id: msg.message_id })
                            .catch((err) => bot.sendMessage(chatId, strings.permission_error.replace(/{x}/g, '解除置顶消息') + '另请确保没有功能相同的 bot 在群内。'));
                }
                else  // 频道马甲发送的消息
                    chatsList[chatId].delete ? deleteMessage(msg, true) : null;
            }
            else if (msg.sender_chat.id == msg.chat.id)  // 匿名管理发送的消息
                chatsList[chatId].deleteAnonymousMessage ? deleteMessage(msg, true) : null;
        }
    }
});

// 响应回调查询
bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    if (query.message.chat.type == 'group' || query.message.chat.type == 'supergroup')
        chatsList[chatId] ? null : chatsList[chatId] = {};
    bot.getChatMember(query.message.chat.id, query.from.id).then(function (result) {
        if (isAdmin(result)) { // 管理员
            let text = '<b>⚙️ 设置</b>', isWhitelist = false;
            switch (query.data) {
                case 'switch':
                    chatsList[chatId].delete = !chatsList[chatId].delete;
                    bot.answerCallbackQuery(query.id, { text: '设置成功' });
                    break;
                case 'deleteAnonymousMessage':
                    chatsList[chatId].deleteAnonymousMessage = !chatsList[chatId].deleteAnonymousMessage;
                    bot.answerCallbackQuery(query.id, { text: '设置成功' });
                    break;
                case 'deleteChannelMessage':
                    chatsList[chatId].deleteChannelMessage = !chatsList[chatId].deleteChannelMessage;
                    if (chatsList[chatId].unpinChannelMessage === chatsList[chatId].deleteChannelMessage === true)
                        delete chatsList[chatId].unpinChannelMessage;
                    bot.answerCallbackQuery(query.id, { text: '设置成功' });
                    break;
                case 'unpinChannelMessage':
                    chatsList[chatId].unpinChannelMessage = !chatsList[chatId].unpinChannelMessage;
                    if (chatsList[chatId].unpinChannelMessage === chatsList[chatId].deleteChannelMessage === true)
                        delete chatsList[chatId].deleteChannelMessage;
                    if (chatsList[chatId].unpinChannelMessage)
                        bot.answerCallbackQuery(query.id, { text: '设置成功。您需要授予我置顶消息的权限。', show_alert: true });
                    else
                        bot.answerCallbackQuery(query.id, { text: '设置成功' });
                    break;
                case 'deleteMsg':
                    bot.deleteMessage(chatId, query.message.message_id);
                    return;
                case 'whitelist':
                    text = strings.whitelist_help;
                    isWhitelist = true;
                    break;
                default:
                    break;
            }
            // 删除白名单中的频道
            if (query.data.startsWith('demote')) {
                let demoteChatId = query.data.split('_')[1];
                bot.answerCallbackQuery(query.id, { text: strings.x_removed_from_whitelist.replace('{x}', chatsList[chatId].whitelist[demoteChatId]).replace('{id}', demoteChatId), show_alert: false });
                text = strings.whitelist_help;
                delete chatsList[chatId].whitelist[demoteChatId];
                isWhitelist = true;
            }
            saveData();
            bot.editMessageText(text, {
                chat_id: chatId,
                message_id: query.message.message_id,
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: generateKeyboard(chatId, isWhitelist) }
            });
        }
        else
            bot.answerCallbackQuery(query.id, { text: strings.query_sender_not_admin, show_alert: true });
    });
});
