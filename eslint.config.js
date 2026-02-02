const globals = require('globals');
const pluginJs = require('@eslint/js');

module.exports = [
  {
    files: ['**/*.js'],
    languageOptions: { 
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.es2021
      }
    },
    rules: {
      'semi': ['error', 'always'],
      'quotes': ['error', 'single'],
      'indent': ['error', 2],
      'no-unused-vars': ['warn', { 
        'argsIgnorePattern': 'next',
        'ignoreRestSiblings': true 
      }],
      'no-console': 'off'
    }
  },
  {
    ignores: ['node_modules/', 'public/']
  },
  pluginJs.configs.recommended,
];
