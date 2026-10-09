// 让 tgcloud/ 中的 `import ... from 'sdk'` 在本地测试时解析到 test/fake-sdk
import { register } from 'node:module';

register('./sdk-loader.js', import.meta.url);
