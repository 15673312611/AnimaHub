/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone', // 鐙珛閮ㄧ讲妯″紡锛屾墦鍖呮垚鏈€灏忓寲鐨?Node.js 鏈嶅姟
  reactStrictMode: false, // 鍏抽棴涓ユ牸妯″紡浠ユ彁鍗囨€ц兘
  typescript: {
    ignoreBuildErrors: true,
  },
  
  // 娣诲姞绌虹殑 turbopack 閰嶇疆浠ュ吋瀹?Next.js 16
  turbopack: {},
  
  // 闅愯棌寮€鍙戞ā寮忎笅鐨勯敊璇偓娴悆
  devIndicators: {
    buildActivity: false,
    buildActivityPosition: 'bottom-right',
  },
  
  // 浼樺寲寮€鍙戞ā寮忔€ц兘
  onDemandEntries: {
    maxInactiveAge: 120 * 1000, // 澧炲姞椤甸潰缂撳瓨鏃堕棿鍒?鍒嗛挓
    pagesBufferLength: 8, // 澧炲姞缂撳瓨椤甸潰鏁伴噺
  },
  
  // 缂栬瘧浼樺寲
  compiler: {
    removeConsole: false, // 寮€鍙戞ā寮忎繚鐣?console
  },
  
  // 浼樺寲鍥剧墖鍔犺浇
  images: {
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'https', hostname: 'doradoapi.top' },
      { protocol: 'https', hostname: '**' }, // 鍏佽鎵€鏈?HTTPS 鍥剧墖
    ],
    // 鐢熶骇鐜鍚敤浼樺寲锛屽紑鍙戠幆澧冭烦杩?
    unoptimized: process.env.NODE_ENV === 'development',
    // 鍥剧墖缂撳瓨鏃堕棿锛堢锛?
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30澶?
    // 璁惧灏哄鏂偣
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    // 鍥剧墖灏哄鏂偣
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
  
  // HTTP 鍝嶅簲澶撮厤缃?- 娣诲姞缂撳瓨鎺у埗
  async headers() {
    return [
      {
        // 瀵规墍鏈夊浘鐗囪祫婧愭坊鍔犵紦瀛樺ご
        source: '/:all*(svg|jpg|jpeg|png|gif|ico|webp|avif)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        // 瀵硅棰戣祫婧愭坊鍔犵紦瀛樺ご
        source: '/:all*(mp4|webm|ogg)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
  
  // Webpack 浼樺寲
  webpack: (config, { dev, isServer }) => {
    if (dev) {
      // 寮€鍙戞ā寮忎紭鍖?
      config.watchOptions = {
        poll: 1000, // 闄嶄綆鏂囦欢鐩戝惉棰戠巼
        aggregateTimeout: 300,
      }
      
      // 鍑忓皯缂栬瘧鏃堕棿
      config.optimization = {
        ...config.optimization,
        removeAvailableModules: false,
        removeEmptyChunks: false,
        splitChunks: false,
      }
    }

    // Work around webpack module-concatenation parse failures seen in this repo on Next 16.
    config.optimization = {
      ...config.optimization,
      concatenateModules: false,
    };

    return config
  },
  
  // 瀹為獙鎬у姛鑳?
  experimental: {
    workerThreads: true,
  },
}

module.exports = nextConfig





