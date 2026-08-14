const svgoConfig = {
  js2svg: {
    indent: 0,
    pretty: false,
  },
  multipass: true,
  plugins: [
    {
      name: 'preset-default',
      params: {
        overrides: {
          cleanupIds: false,
        },
      },
    },
  ],
};

export default svgoConfig;
