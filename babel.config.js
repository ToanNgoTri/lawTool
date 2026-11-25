module.exports = {
  presets: ['module:@react-native/babel-preset'],
  // htmlparser2 (cheerio/slim, dùng ở src/banAnNguon.js) có `export * as x from`
  plugins: ['@babel/plugin-transform-export-namespace-from'],
};
