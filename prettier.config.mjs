/** @type {import('prettier').Config} */
const config = {
  overrides: [
    {
      files: '*.svg',
      options: { parser: 'html' },
    },
  ],
  singleQuote: true,
  trailingComma: 'all',
};

export default config;
