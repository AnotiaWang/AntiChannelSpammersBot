const MODULES = {
    'sdk': './fake-sdk/index.js',
    'sdk/db': './fake-sdk/db.js',
    'sdk/api': './fake-sdk/index.js'
};

// 测试中的所有者 UID
export const TEST_ADMIN_ID = 42;

export async function resolve(specifier, context, next) {
    if (Object.hasOwn(MODULES, specifier)) {
        return { url: new URL(MODULES[specifier], import.meta.url).href, shortCircuit: true };
    }
    return next(specifier, context);
}

// 覆盖 config.js 中的 ADMIN_ID，以便测试所有者命令
export async function load(url, context, next) {
    const result = await next(url, context);
    if (url.endsWith('/tgcloud/lib/config.js')) {
        const source = String(result.source).replace(/export const ADMIN_ID = \d+;/, `export const ADMIN_ID = ${TEST_ADMIN_ID};`);
        return { ...result, source };
    }
    return result;
}
