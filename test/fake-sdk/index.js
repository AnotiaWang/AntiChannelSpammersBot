// 本地测试用的 sdk：api 记录所有调用，可按方法名设置返回值或抛出 BotApiError
import { db } from './db.js';

export { db };

export class BotApiError extends Error {
    constructor(code, description, parameters = undefined) {
        super(description);
        this.code = code;
        this.description = description;
        this.parameters = parameters;
    }
}

export class EndpointError extends Error {}

export class InputFile {
    constructor(bytes, filename, opts = {}) {
        this.bytes = bytes;
        this.filename = filename;
        this.type = opts.type;
    }
}

export const BOT = { id: 999, is_bot: true, username: 'TestBot' };

export const calls = [];
export const handlers = {};
let nextMessageId = 1000;

const defaults = {
    getMe: () => BOT,
    sendMessage: (p) => ({ message_id: nextMessageId++, chat: { id: p.chat_id }, text: p.text }),
    sendDocument: (p) => ({ message_id: nextMessageId++, chat: { id: p.chat_id } })
};

export function resetApi() {
    calls.length = 0;
    for (const key in handlers) delete handlers[key];
}

export function callsOf(method) {
    return calls.filter((c) => c.method === method).map((c) => c.params);
}

export const api = new Proxy({}, {
    get(_, method) {
        return async (params = {}) => {
            calls.push({ method, params });
            const handler = handlers[method] ?? defaults[method];
            return handler ? handler(params) : true;
        };
    }
});

export async function fetch() {
    throw new Error('fetch is not available in tests');
}
