/** @type {import("eslint").Linter.Config} */
module.exports = {
  extends: [
    './index.js',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'plugin:react/jsx-runtime',
  ],
  settings: { react: { version: 'detect' } },
  rules: {
    'react/prop-types': 'off',
  },
}
