/**
 * 宝塔面板启动入口
 * 宝塔设置：项目目录 /www/wwwroot/node，启动文件 server.js
 */
process.env.PORT = process.env.PORT || '3100';
process.env.HOSTNAME = process.env.HOSTNAME || '0.0.0.0';
require('./.next/standalone/server.js');
