// Serverless 没有环境变量，配置直接写在这里。

// 机器人所有者的 UID：接收错误报告，可使用 /stats、/backup、/import。
// 0 表示不设置，此时所有者命令不可用，错误只输出到日志。
export const ADMIN_ID = 0;

// 源码地址，显示在欢迎和帮助消息中
export const SOURCE_URL = 'https://github.com/AnotiaWang/AntiChannelSpammersBot';

// 自动清理命令消息的延迟
export const COMMAND_DELETE_DELAY = 10_000;
// 机器人提示消息的自动删除延迟
export const NOTICE_DELETE_DELAY = 15_000;
// 每次处理更新时，最多顺带删除多少条到期的消息
export const DELETION_SWEEP_LIMIT = 10;
// 到期超过此时长仍未删除的记录直接丢弃（超过 48 小时的消息通常已无法删除）
export const DELETION_MAX_AGE = 48 * 3600 * 1000;

// /stats members 单次调用的时间预算，超出后保存进度，再次发送命令继续
export const STATS_TIME_BUDGET = 10_000;
