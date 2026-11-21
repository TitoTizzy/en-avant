import { ESLint } from 'eslint';
let errors = 0;
for (const [files, env, globals, ignorePatterns] of [
  ['api/**/*.js', { node: true, es2022: true }, {}, []],
  ['js/**/*.js', { browser: true, es2022: true }, { supabase: 'readonly', Quill: 'readonly', dataLayer: 'readonly' }, ['js/vendor/**']],
]) {
  const engine = new ESLint({ useEslintrc: false, baseConfig: {
    env, globals, ignorePatterns, parserOptions: { ecmaVersion: 2022, sourceType: 'module' }, rules: { 'no-undef': 'error' },
  } });
  const results = await engine.lintFiles(files);
  const report = await (await engine.loadFormatter('stylish')).format(results);
  if (report) console.log(report);
  errors += results.reduce((sum, r) => sum + r.errorCount, 0);
}
if (errors) process.exitCode = 1;
