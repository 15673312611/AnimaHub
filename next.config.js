/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false, // 关闭严格模式以提升性能
  
  // 添加空的 turbopack 配置以兼容 Next.js 16
  turbopack: {},
  
  // 隐藏开发模式下的错误悬浮球
  devIndicators: {
    buildActivity: false,
    buildActivityPosition: 'bottom-right',
  },
  
  // 优化开发模式性能
  onDemandEntries: {
    maxInactiveAge: 120 * 1000, // 增加页面缓存时间到2分钟
    pagesBufferLength: 8, // 增加缓存页面数量
  },
  
  // 编译优化
  compiler: {
    removeConsole: false, // 开发模式保留 console
  },
  
  // 优化图片加载
  images: {
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'https', hostname: 'doradoapi.top' },
    ],
    unoptimized: true, // 开发模式下跳过图片优化
  },
  
  // Webpack 优化
  webpack: (config, { dev, isServer }) => {
    if (dev) {
      // 开发模式优化
      config.watchOptions = {
        poll: 1000, // 降低文件监听频率
        aggregateTimeout: 300,
      }
      
      // 减少编译时间
      config.optimization = {
        ...config.optimization,
        removeAvailableModules: false,
        removeEmptyChunks: false,
        splitChunks: false,
      }
    }
    
    return config
  },
  
  // 实验性功能
  experimental: {
    optimizePackageImports: ['lucide-react', 'framer-motion'], // 优化图标库和动画库导入
  },
}

module.exports = nextConfig
