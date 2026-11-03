/* global __dirname */
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 13)) {
  console.error('Serra Runner requer Node.js 22.13 ou superior. Instala Node 24 e volta a executar npm run setup.');
  process.exit(1);
}
const npmCli = process.env.npm_execpath;
if (!npmCli) {
  console.error('Executa este script através de npm run setup.');
  process.exit(1);
}
const root = path.resolve(__dirname, '..');
for (const args of [['ci', '--include=dev'], ['run', 'build']]) {
  console.log(`Serra Runner: npm ${args.join(' ')}`);
  const result = spawnSync(process.execPath, [npmCli, ...args], { cwd: root, stdio: 'inherit', env: process.env });
  if (result.error) { console.error(result.error.message); process.exit(1); }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log('Projeto preparado. Usa npm start para abrir o jogo; npm run server:start para o servidor multiplayer local.');
