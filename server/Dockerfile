# HearSight Server - Node.js
FROM node:20-slim

# Install OpenSSL for Prisma
RUN apt-get update -y && apt-get install -y openssl

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm ci --only=production

# Generate Prisma client
RUN npx prisma generate

# Copy source code
COPY dist ./dist

# Expose port
EXPOSE 9999

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:9999/health || exit 1

# Start server
CMD ["node", "dist/index.js"]
