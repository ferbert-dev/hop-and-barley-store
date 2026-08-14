import base from './base.mjs';

export default [
  ...base,
  {
    rules: {
      'no-console': 'warn',
      '@typescript-eslint/no-extraneous-class': 'off',
    },
  },
];
