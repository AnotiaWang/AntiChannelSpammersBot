// 本地测试用的 sdk/db：原始 SQL 由 node:sqlite 执行，schema DSL 只实现本项目用到的部分，用于生成建表语句
import { DatabaseSync } from 'node:sqlite';

let sqlite = new DatabaseSync(':memory:');

function plain(row) {
    return row ? { ...row } : null;
}

export const db = {
    async run(query, params = {}) {
        const stmt = sqlite.prepare(query);
        if (/\bRETURNING\b/i.test(query)) {
            const rows = stmt.all(params).map(plain);
            return { rowsAffected: rows.length, lastInsertRowid: 0, rows };
        }
        const result = stmt.run(params);
        return { rowsAffected: Number(result.changes), lastInsertRowid: Number(result.lastInsertRowid), rows: [] };
    },
    async all(query, params = {}) {
        return sqlite.prepare(query).all(params).map(plain);
    },
    async get(query, params = {}) {
        return plain(sqlite.prepare(query).get(params));
    }
};

export default db;

class Column {
    constructor(type, name) {
        this.type = type;
        this.name = name;
        this.parts = [];
    }

    primaryKey(opts = {}) {
        this.parts.push(opts.autoIncrement ? 'PRIMARY KEY AUTOINCREMENT' : 'PRIMARY KEY');
        return this;
    }

    notNull() {
        this.parts.push('NOT NULL');
        return this;
    }

    default(value) {
        const literal = typeof value === 'boolean' ? (value ? 1 : 0)
            : typeof value === 'string' ? `'${value.replace(/'/g, "''")}'` : value;
        this.parts.push(`DEFAULT ${literal}`);
        return this;
    }
}

const column = (type) => (name) => new Column(type, name);
export const integer = column('INTEGER');
export const text = column('TEXT');
export const boolean = column('INTEGER');
export const json = column('TEXT');

export function primaryKey({ columns }) {
    return { kind: 'pk', columns };
}

export function index(name) {
    return { on: (...columns) => ({ kind: 'index', name, columns }) };
}

export function table(name, columns, extra) {
    for (const [key, col] of Object.entries(columns)) col.name ??= key;
    return { tableName: name, columns, extra: extra ? extra(columns) : {} };
}

// 按 schema.js 的导出重建内存数据库
export function resetDatabase(schema) {
    sqlite.close();
    sqlite = new DatabaseSync(':memory:');
    for (const t of Object.values(schema)) {
        if (!t?.tableName) continue;
        const defs = Object.values(t.columns).map((c) => [c.name, c.type, ...c.parts].join(' '));
        const indexes = [];
        for (const item of Object.values(t.extra)) {
            if (item.kind === 'pk') defs.push(`PRIMARY KEY (${item.columns.map((c) => c.name).join(', ')})`);
            if (item.kind === 'index') indexes.push(`CREATE INDEX ${item.name} ON ${t.tableName} (${item.columns.map((c) => c.name).join(', ')})`);
        }
        sqlite.exec(`CREATE TABLE ${t.tableName} (${defs.join(', ')})`);
        for (const sql of indexes) sqlite.exec(sql);
    }
}
