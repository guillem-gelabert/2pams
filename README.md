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

## 🤝 Contributing

1. Follow the linting rules: `npm run lint`
2. Format your code: `npm run format`
3. Ensure all tests pass
4. Submit a pull request

## 📄 License

ISC
