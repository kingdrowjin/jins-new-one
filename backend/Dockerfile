# Use Node.js 20+ - required for Baileys
FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY . .

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
