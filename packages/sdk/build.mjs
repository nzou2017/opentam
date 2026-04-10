import { build } from 'esbuild';

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2020'],
  outfile: 'dist/q.min.js',
  platform: 'browser',
  define: {
    'process.env.NODE_ENV': '"production"',
  },
});

console.log('SDK built: dist/q.min.js');
