const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// Colyseus 0.16's ESM exports choose Node HTTP on native. Its official standalone
// browser bundle uses the WebSocket/XMLHttpRequest globals supplied by RN.
const nativeColyseus = path.join(path.dirname(require.resolve('colyseus.js/package.json')), 'dist', 'colyseus.js');
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if ((platform === 'android' || platform === 'ios') && moduleName === 'colyseus.js') {
    return { type: 'sourceFile', filePath: nativeColyseus };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
