# Use Node.js 18 with Debian for Puppeteer/Chrome support
FROM node:18-slim

# Install Chrome dependencies for Puppeteer
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-freefont-ttf \
    libxss1 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Set Puppeteer to use system Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# Copy package files (from repo root context)
COPY backend/package.json backend/package-lock.json ./

# Install ALL dependencies (including devDependencies for build)
RUN npm ci

# Copy source code (from repo root context)
COPY backend/ .

# Build the application
RUN npm run build

# Remove devDependencies after build
RUN npm prune --production

# Create directories for sessions and uploads
RUN mkdir -p whatsapp-sessions uploads

# Expose port
EXPOSE 3000

# Start the application
CMD ["node", "dist/main.js"]
