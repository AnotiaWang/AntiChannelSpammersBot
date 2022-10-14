import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { log } from './misc.js';
import { admin, bot } from '../../index.js';

const template = {
    del: false,
    delCmd: false,
    delAnonMsg: false,
    delLinkChanMsg: false,
    unpinChanMsg: false,
    whitelist: {}
};

let chatsList = {};

class Data {
    static save() {
        if (!existsSync('./data'))
            mkdirSync('./data');
        writeFileSync('./data/chatsList.json', JSON.stringify(chatsList));
    }

    static load() {
        try {
            Object.assign(chatsList, JSON.parse(readFileSync('./data/chatsList.json', 'utf-8')));
            log('加载数据成功');
        }
        catch (err) {
            log(`未发现数据或恢复失败，已重新创建数据，报错信息：${err.message}`);
        }
    }

    static backup() {
        bot.telegram.sendDocument(admin, { source: './data/chatsList.json' }, {
            caption: '#backup',
            disable_notification: true
        }).catch((e) => {
            log(`备份失败: ${e.message}`, true);
            bot.telegram.sendMessage(admin, '备份失败:' + e.message).catch(() => null);
        });
    }

    static checkChat(chatId) {
        if (typeof chatsList[chatId] === 'undefined') {
            chatsList[chatId] = deepClone(template);
        }
        else {
            for (let a in template) {
                if (typeof chatsList[chatId][a] === 'undefined') {
                    chatsList[chatId][a] = deepClone(template[a]);
                }
            }
        }
    }
}

// https://segmentfault.com/a/1190000018903274
function deepClone(obj) {
    let copy;

    // Handle the 3 simple types, and null or undefined
    if (null == obj || 'object' != typeof obj) return obj;

    // Handle Date
    if (obj instanceof Date) {
        copy = new Date();
        copy.setTime(obj.getTime());
        return copy;
    }

    // Handle Array
    if (obj instanceof Array) {
        copy = [];
        for (let i = 0, len = obj.length; i < len; i++) {
            copy[i] = deepClone(obj[i]);
        }
        return copy;
    }

    // Handle Function
    if (obj instanceof Function) {
        copy = function () {
            return obj.apply(this, arguments);
        };
        return copy;
    }

    // Handle Object
    if (obj instanceof Object) {
        copy = {};
        for (let attr in obj) {
            if (obj.hasOwnProperty(attr)) copy[attr] = deepClone(obj[attr]);
        }
        return copy;
    }

    throw new Error('Unable to copy obj as type isn\'t supported ' + obj.constructor.name);
}

export default Data;
export { template, chatsList };
