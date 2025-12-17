# Jantu - WhatsApp Automation Platform

A full-stack WhatsApp automation platform with QR-based WhatsApp Web linking, bulk campaign management, and REST APIs for programmatic access.

## Features

- **Multi-user Authentication** - JWT-based auth with registration/login
- **WhatsApp Integration** - Connect WhatsApp via QR code (like WhatsApp Web)
- **Campaign Management** - Send bulk messages with media attachments
- **Rate-limited Messaging** - Configurable delays to avoid detection
- **SMS Integration** - Twilio-based SMS sending
- **REST APIs** - Public API endpoints with API key authentication
- **Credit System** - Track usage with credit balance

## Tech Stack

- **Frontend**: React 18 + TypeScript + Tailwind CSS + Vite
- **Backend**: NestJS + TypeScript
- **Database**: MySQL with TypeORM
- **WhatsApp**: whatsapp-web.js (Puppeteer-based)
- **SMS**: Twilio SDK
- **Queue**: Bull (Redis-based) for rate-limited processing

## Prerequisites

- Node.js 18+
- Docker & Docker Compose (for MySQL and Redis)
- Chrome/Chromium (for whatsapp-web.js)

## Quick Start

### 1. Start Database Services

```bash
cd jantu
docker-compose up -d
```

This starts MySQL and Redis containers.

### 2. Setup Backend

```bash
cd backend
npm install
cp .env .env.local  # Edit with your settings
npm run start:dev
```

Backend runs on http://localhost:3000

### 3. Setup Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on http://localhost:5173

## Configuration

Edit `backend/.env`:

```env
# Database
DB_HOST=localhost
DB_PORT=3306
DB_USERNAME=jantu
DB_PASSWORD=jantupassword
DB_DATABASE=jantu

# JWT
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=7d

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Twilio (optional)
TWILIO_ACCOUNT_SID=your-account-sid
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_PHONE_NUMBER=+1234567890

# Rate Limiting
MESSAGE_DELAY_MIN=3000
MESSAGE_DELAY_MAX=5000
```

## Usage

### 1. Register/Login

Create an account at http://localhost:5173/register

### 2. Connect WhatsApp

1. Go to "Register WAPP"
2. Enter a session name
3. Scan the QR code with WhatsApp on your phone
4. Wait for connection confirmation

### 3. Send Campaign

1. Go to "Button Campaign"
2. Enter campaign name
3. Add phone numbers (one per line)
4. Write your message
5. Optionally add buttons and media
6. Click "Send Now"

### 4. Use API

1. Go to "Manage API Key"
2. Create an API key
3. Use the documented endpoints:

```bash
# Send WhatsApp message
curl -X POST "http://localhost:3000/wapp/api/send?apikey=YOUR_KEY&mobile=919876543210&msg=Hello"

# Send SMS
curl -X POST "http://localhost:3000/api/sendsms?apikey=YOUR_KEY&number=919876543210&msg=Hello&sendername=JANTU"
```

## API Endpoints

### Authentication
- `POST /auth/register` - Register user
- `POST /auth/login` - Login user
- `GET /auth/profile` - Get profile (requires JWT)

### WhatsApp Sessions
- `POST /whatsapp/sessions` - Create session
- `GET /whatsapp/sessions` - List sessions
- `DELETE /whatsapp/sessions/:id` - Delete session

### Campaigns
- `POST /campaigns` - Create campaign
- `GET /campaigns` - List campaigns
- `POST /campaigns/:id/recipients` - Add recipients
- `POST /campaigns/:id/media` - Upload media
- `POST /campaigns/:id/send` - Start campaign

### Public API (API Key Auth)
- `POST /wapp/api/send` - Send WhatsApp message
- `POST /api/sendsms` - Send SMS
- `POST /api/sendbulksms` - Send bulk SMS

## Project Structure

```
jantu/
├── backend/                # NestJS Backend
│   ├── src/
│   │   ├── auth/          # Authentication
│   │   ├── users/         # User management
│   │   ├── whatsapp/      # WhatsApp integration
│   │   ├── sms/           # SMS integration
│   │   ├── campaigns/     # Campaign management
│   │   ├── api-keys/      # API key management
│   │   ├── uploads/       # File uploads
│   │   └── queue/         # Message queue
│   └── uploads/           # Uploaded files
│
├── frontend/              # React Frontend
│   └── src/
│       ├── components/    # Reusable components
│       ├── pages/         # Page components
│       ├── services/      # API services
│       └── context/       # React context
│
└── docker-compose.yml     # MySQL + Redis
```

## Swagger Documentation

API documentation available at http://localhost:3000/api/docs

## License

MIT
