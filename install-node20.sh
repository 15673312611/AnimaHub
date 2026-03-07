#!/bin/bash
# Install Node.js 20 on Linux server (for BaoTa panel)

set -e

echo "=== Installing Node.js 20 ==="

# Download Node.js 20 binary
cd /usr/local
curl -fsSL https://npmmirror.com/mirrors/node/v20.11.1/node-v20.11.1-linux-x64.tar.xz | tar -xJ

# Create symlinks
ln -sf /usr/local/node-v20.11.1-linux-x64/bin/node /usr/local/bin/node
ln -sf /usr/local/node-v20.11.1-linux-x64/bin/npm /usr/local/bin/npm
ln -sf /usr/local/node-v20.11.1-linux-x64/bin/npx /usr/local/bin/npx

# Verify
echo ""
echo "=== Installation Complete ==="
node -v
npm -v

echo ""
echo "Node.js 20 installed successfully!"
echo "You can now deploy your Next.js 16 project."
