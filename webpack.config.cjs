const path = require('path');

module.exports = {
  target: 'node',
  entry: './build/index.js',
  output: {
    filename: 'bundle.cjs',
    path: path.resolve(__dirname, 'dist'),
    clean: true,
    libraryTarget: 'commonjs2'
  },
  mode: 'production',
  experiments: {
    topLevelAwait: true
  },
  optimization: {
    minimize: true,
    splitChunks: false,
    runtimeChunk: false
  }
};