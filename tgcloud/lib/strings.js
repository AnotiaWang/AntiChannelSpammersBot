// 文本均为 HTML，发送时需带上 parse_mode: 'HTML'；answerCallbackQuery 只能用纯文本
import { SOURCE_URL } from './config.js';

export function escapeHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

const b = (s) => `<b>${s}</b>`;
const code = (s) => `<code>${escapeHtml(s)}</code>`;
const link = (s, url) => `<a href="${escapeHtml(url)}">${s}</a>`;

const strings = {
    analyzing: '正在统计...',
    stats: ({ joinedGroups, enabledGroups, delGroups, whitelistEntries, pendingDeletions }) =>
        `${b('🎉 统计信息')}\n加入的群组：${joinedGroups} 个\n启用的群组：${enabledGroups} 个\n` +
        `删除马甲消息的群组：${delGroups} 个\n白名单条目：${whitelistEntries} 条\n待删除的消息：${pendingDeletions} 条\n\n` +
        `发送 ${code('/stats members')} 统计成员数。`,
    stats_members_progress: (processed, total) =>
        `统计中 ${(total ? processed / total * 100 : 100).toFixed(2)}% (${processed} / ${total}) ...`,
    stats_members: ({ total, joinedMembers, enabledMembers, removed, skipped }) =>
        `${b('🎉 成员统计')}\n统计群组：${total} 个\n成员数：${joinedMembers} 人\n` +
        `启用删除马甲消息的群组成员数：${enabledMembers} 人\n已清除失效群组：${removed} 个` +
        (skipped ? `\n获取失败：${skipped} 个` : ''),
    welcome_private: `${b('欢迎使用 🎉')}\n\n我可以：\n- 删除群成员以频道身份发送的消息\n- 删除匿名群管理的消息\n- 删除来自关联频道的消息\n- 解除频道消息在群内的置顶\n\n点击下面的按钮，将我添加至群组。\n\n源代码：${link('GitHub', SOURCE_URL)}`,
    welcome_group: '欢迎使用！您可以发送 /on 或 /off 一键开启/关闭反马甲。发送 /config 进行详细的设置，更多用法详见 /help。',
    add_to_group: '点此将我添加到群组',
    group_only: '请在群组中使用。',
    del_channel_message_on: '已在本群启用自动删除频道马甲发送的消息。\n\n您需要将我设置为管理员，并授予删除消息的权限。您可以发送 /config 查看相关设置，发送 /help 查看功能帮助。',
    del_channel_message_off: '已停止自动删除频道马甲发送的消息。',
    operator_not_admin: (id) => `${link('您', `tg://user?id=${id}`)}不是群主或管理员。`,
    help: `${b('🤖 使用帮助')}\n\n${b(' - /on | /off')}: 启用 / 关闭自动删除\n\n${b(' - /ban | /unban')}: 封禁/解封马甲。被封禁后，对方无法使用任何马甲在本群发言。您也可以在群组设置里解封频道。\n\n${b(' - /promote | /demote')}: 将频道加入/移出白名单。支持将频道 UID (${code('-10012345678')}) / username (${code('@YuanShen')}) 作为参数，也可以回复一条消息来操作。\n\n${b(' - /config')}: 显示此群组的设置：\n    - 开关 “删除频道马甲的消息”；\n    - 开关 “删除群管匿名发送的消息”；\n    - 开关 “删除来自关联频道的消息”；\n    - 开关 “解除频道消息在群内置顶”；\n    - 开关 “自动清理命令”；\n    - 查看和编辑白名单。\n\n本机器人基于 GPLv3 协议开源，源码发布于 ${link('GitHub', SOURCE_URL)}。`,
    x_added_to_whitelist: (x, id) => `已将 "${escapeHtml(x)}" (${code(id)}) 添加到白名单。`,
    x_removed_from_whitelist: (x, id) => `已将 "${escapeHtml(x)}" (${code(id)}) 从白名单中移除。`,
    // 纯文本版本，用于 answerCallbackQuery
    x_removed_from_whitelist_plain: (x, id) => `已将 "${x}" (${id}) 从白名单中移除。`,
    x_already_in_whitelist: '该频道已在白名单中。',
    x_not_in_whitelist: '该频道不在白名单中。',
    x_not_a_channel: '目标不是频道，无法操作。',
    get_channel_error: (reason) => `查询失败：指定目标不是频道或不存在，请检查您的格式。请以频道 UID(如 ${code('-10012345678')}) 或 username(@xxxx，仅公开频道拥有) 作为命令参数。\n${escapeHtml(reason)}`,
    command_usage_error: `请回复一条消息，或者使用 ${code('[频道 UID/username]')} 作为命令参数。`,
    whitelist_help: `${b('📃 白名单')}\n\n点击按钮取消对应频道的授权。`,
    query_sender_not_admin: '您不是群主或管理员，再点我要摇人啦！\n\nPS：如果没有管理员权限，我可能无法获取群内成员权限组。',
    ban_sender_chat_success: (id) => `已封禁频道 ${code(id)}，其所有者将无法在本群使用任何频道马甲。`,
    unban_sender_chat_success: (id) => `已解封频道 ${code(id)}。`,
    permission_error: (x) => `${x}失败，请检查您是否授予了我相应的权限，以及群内是否有提供类似功能的机器人。`,
    deleteMsgFailure: (id, err) => `尝试删除消息 (ID ${id}) 失败！错误信息：${escapeHtml(err)}\n\n可能的原因：\n1. 我没有删除消息的权限；\n2. 目标消息已经发出超过 48 小时。(此消息 15 秒后删除)`,
    deleteMsg: '删除此消息',
    deleteMsgCallbackFailure: '删除消息失败，请稍后再试',
    settings: b('⚙️ 设置'),
    ban_sender_chat: '封禁频道马甲',
    unban_sender_chat: '解封频道马甲',
    unpin_message: '解除消息置顶',
    settings_saved: '设置成功',
    pin_permission_needed: '请确保您已经授予我置顶消息的权限。',
    deleteCommandHelp: '设置成功，我会在命令消息发出 10 秒后尝试删除。',
    deleteChannelSenderMsg: '删除频道马甲消息',
    deleteAnonymousAdminMsg: '删除匿名管理消息',
    deleteLinkedChannelMsg: '删除来自关联频道的消息',
    unpinChannelMsg: '解除频道消息在群内置顶',
    deleteCommand: '自动清理命令',
    channelWhitelist: '频道马甲白名单',
    backup_caption: '#backup',
    import_usage: `请发送 chatsList.json 文件并附上说明文字 ${code('/import')}，或回复该文件发送 ${code('/import')}。`,
    import_failed: (reason) => `导入失败：${escapeHtml(reason)}`,
    import_success: ({ chats, whitelist, skipped }) =>
        `导入完成：${chats} 个群组，${whitelist} 条白名单` + (skipped ? `，跳过 ${skipped} 个无效条目` : '') + '。'
};

export default strings;
