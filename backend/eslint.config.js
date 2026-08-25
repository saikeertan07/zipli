const noUnsanitized = require('eslint-plugin-no-unsanitized');

module.exports = [
  {
    files: ['src/**/*.js', 'tests/**/*.js'],
    plugins: {
      'no-unsanitized': noUnsanitized,
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        require: 'readonly',
        module: 'readonly',
        __dirname: 'readonly',
        process: 'readonly',
        console: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        before: 'readonly',
        after: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'no-console': 'off',
      eqeqeq: ['error', 'smart'],
      'no-unsanitized/method': 'error',
      'no-unsanitized/property': 'error',
    },
  },
];
