/**
 * postbuild.mjs - 构建后自动复制静态资源到 standalone 目录
 * 在 npm run build 后自动执行
 */
import { cpSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const standalone = join(root, '.next', 'standalone');

// 复制 .next/static -> .next/standalone/.next/static
const staticSrc = join(root, '.next', 'static');
const staticDest = join(standalone, '.next', 'static');
if (existsSync(staticSrc)) {
  cpSync(staticSrc, staticDest, { recursive: true });
  console.log('✓ 已复制 .next/static');
}

// 复制 public -> .next/standalone/public
const publicSrc = join(root, 'public');
const publicDest = join(standalone, 'public');
if (existsSync(publicSrc)) {
  cpSync(publicSrc, publicDest, { recursive: true });
  console.log('✓ 已复制 public');
}

console.log('✓ postbuild 完成');
