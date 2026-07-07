module.exports = {
  root: true,
  env: {
    es6: true,
    node: true,
  },
  parserOptions: {
    ecmaVersion: 2023,
    sourceType: "script", // CommonJS
  },
  extends: ["eslint:recommended"],
  rules: {
    "no-unused-vars": "off", // convert.js port có nhiều biến trung gian chưa dùng
    "no-empty": "off",
    "no-useless-escape": "off", // regex port giữ nguyên
    "no-control-regex": "off",
  },
};
