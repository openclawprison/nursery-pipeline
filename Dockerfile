FROM node:20-slim

# Install FFmpeg (required for video assembly)
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy backend
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --production

# Copy frontend
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm ci

# Copy source code
COPY backend/ ./backend/
COPY frontend/ ./frontend/

# Build frontend
RUN cd frontend && npm run build

# Create output directory
RUN mkdir -p /app/backend/output

# Expose port
EXPOSE 3001

# Start backend (serves frontend too)
WORKDIR /app/backend
CMD ["node", "server.js"]
