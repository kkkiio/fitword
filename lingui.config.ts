import { defineConfig } from '@lingui/conf';

export default defineConfig({
  sourceLocale: 'zh-CN',
  locales: ['zh-CN', 'en'],
  catalogs: [
    {
      path: '<rootDir>/src/locales/{locale}/messages',
      include: ['src/client'],
    },
  ],
});
