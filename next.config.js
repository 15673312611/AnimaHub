/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone', // 独立部署模式，打包成最小化的 Node.js 服务
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
      { protocol: 'https', hostname: '**' }, // 允许所有 HTTPS 图片
    ],
    // 生产环境启用优化，开发环境跳过
    unoptimized: process.env.NODE_ENV === 'development',
    // 图片缓存时间（秒）
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30天
    // 设备尺寸断点
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    // 图片尺寸断点
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
  
  // HTTP 响应头配置 - 添加缓存控制
  async headers() {
    return [
      {
        // 对所有图片资源添加缓存头
        source: '/:all*(svg|jpg|jpeg|png|gif|ico|webp|avif)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        // 对视频资源添加缓存头
        source: '/:all*(mp4|webm|ogg)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        // 对静态资源添加缓存头
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
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
