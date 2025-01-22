import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
  target: 'node',
  entry: './build/index.js',
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'dist'),
    clean: true
  },
  mode: 'production',
  resolve: {
    extensions: ['.js', '.ts']
  },
  optimization: {
    minimize: true
  },
  experiments: {
    topLevelAwait: true
  }
};