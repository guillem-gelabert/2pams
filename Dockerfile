FROM node:24-alpine

WORKDIR /app

# Build argument for deployment timestamp
ARG DEPLOYMENT_TIMESTAMP
ENV DEPLOYMENT_TIMESTAMP=${DEPLOYMENT_TIMESTAMP}

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Expose the port
EXPOSE 3000

CMD ["npm", "run", "start"]