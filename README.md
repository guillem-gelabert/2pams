# 2pams - TypeScript Express.js API

A modern TypeScript Express.js API with state-of-the-art linting and development tools.

## 🚀 Features

- **TypeScript** - Full type safety and modern JavaScript features
- **Express.js** - Fast, unopinionated web framework
- **ESLint + Prettier** - State-of-the-art linting and code formatting
- **Nodemon** - Auto-restart on file changes
- **ts-node** - Run TypeScript directly without compilation
- **dotenv** - Environment variable management

## 📦 Installation

```bash
npm install
```

## 🛠️ Development

### Start development server

```bash
npm run dev
```

The server will start on `http://localhost:3000` with auto-restart on file changes.

### Build for production

```bash
npm run build
```

### Start production server

```bash
npm start
```

## 🔧 Code Quality

### Lint code

```bash
npm run lint
```

### Fix linting issues automatically

```bash
npm run lint:fix
```

### Format code with Prettier

```bash
npm run format
```

### Check code formatting

```bash
npm run format:check
```

## 🌐 API Endpoints

- `GET /` - Welcome message and API info
- `GET /health` - Health check endpoint

## 🛡️ Linting Configuration

This project uses a comprehensive ESLint setup with:

- **TypeScript ESLint** - TypeScript-specific linting rules
- **Prettier integration** - Automatic code formatting
- **Strict TypeScript rules** - Enhanced type safety
- **Modern JavaScript rules** - Best practices and code quality

### Key Linting Features

- Strict TypeScript checking with type-aware rules
- Automatic code formatting with Prettier
- Unused variable detection
- Promise handling validation
- Security best practices
- Modern JavaScript/TypeScript patterns

## 🔄 Scripts

| Script                 | Description                              |
| ---------------------- | ---------------------------------------- |
| `npm run dev`          | Start development server with hot reload |
| `npm run build`        | Compile TypeScript to JavaScript         |
| `npm start`            | Start production server                  |
| `npm run lint`         | Check code with ESLint                   |
| `npm run lint:fix`     | Fix ESLint issues automatically          |
| `npm run format`       | Format code with Prettier                |
| `npm run format:check` | Check code formatting                    |

## 🚀 Getting Started

1. Clone the repository
2. Install dependencies: `npm install`
3. Start development server: `npm run dev`
4. Visit `http://localhost:3000` to see the API

## 📝 Environment Variables

Copy `.env.example` to `.env` and configure your environment variables:

```bash
cp .env.example .env
```

### Available Variables

- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment (development/production)

### Example .env file

```env
PORT=3000
NODE_ENV=development
```

## 🚀 Deployment

### Docker Build

Build the Docker image:

```bash
docker build -t 2pams:latest .
```

To set a custom deployment timestamp:

```bash
docker build --build-arg DEPLOYMENT_TIMESTAMP="2025-01-15T10:30:00Z" -t 2pams:latest .
```

### Docker Run

Run the container:

```bash
docker run -p 3000:3000 \
  -e NODE_ENV=production \
  -e PORT=3000 \
  2pams:latest
```

### Docker Compose

#### Development

Start the development environment with hot reload:

```bash
docker-compose -f docker-compose.dev.yml up
```

#### Production

Set required environment variables and start:

```bash
export DOMAIN=your-domain.com
export PORT=3000
export DEPLOYMENT_TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)  # Optional: set custom timestamp

docker-compose -f docker-compose.prod.yml up -d
```

The `DEPLOYMENT_TIMESTAMP` environment variable is optional. If not set, the server will use its start time as the deployment timestamp.

### CI/CD Deployment

The project includes GitHub Actions workflows for automated deployment:

#### Automatic Deployment

- **Push to `main` branch**: Automatically builds and pushes Docker image to GitHub Container Registry
- **Tagged releases** (e.g., `v1.0.0`): Creates versioned images
- **Pull requests**: Builds images for testing (does not push)

The deployment timestamp is automatically set during CI/CD:

- Uses commit timestamp for push events
- Falls back to build start time for other events

#### Manual Deployment

Images are available at: `ghcr.io/<your-org>/2pams:<tag>`

Pull and run:

```bash
docker pull ghcr.io/<your-org>/2pams:latest
docker run -p 3000:3000 ghcr.io/<your-org>/2pams:latest
```

### Deployment Timestamp

The application includes a meta tag with the deployment timestamp in all served pages:

```html
<meta name="deployment-timestamp" content="2025-01-15T10:30:00Z" />
```

This timestamp is set:

- **CI/CD**: Automatically from commit/build time
- **Docker build**: Via `DEPLOYMENT_TIMESTAMP` build arg
- **Docker Compose**: Via `DEPLOYMENT_TIMESTAMP` environment variable
- **Default**: Server start time if not specified

## 🤝 Contributing

1. Follow the linting rules: `npm run lint`
2. Format your code: `npm run format`
3. Ensure all tests pass
4. Submit a pull request

## 📄 License

ISC
