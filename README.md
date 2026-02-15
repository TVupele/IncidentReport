# MATASA Incident Report Platform

A lightweight, highly reliable dual-channel incident reporting and escalation platform for rural and peri-urban users in Nigeria.

## Features

### USSD Interface (Primary)
- Menu-driven, minimal text navigation
- Numeric inputs only for feature phones
- Auto-timeout safety (2-minute session limit)
- Hausa-first language with English fallback
- Cell-tower location capture via telco metadata
- 4-digit numeric menus optimized for low-connectivity

### Mobile/Web Interface (Secondary)
- Responsive design for low-end Android devices
- GPS auto-capture with manual override
- Optional photo/audio uploads (low-bandwidth optimized)
- Offline caching and sync for intermittent connectivity
- Works on minimal data plans

### Core User Actions
1. **Report Suspicious Activity** - Ƙara Sh suspended activity
2. **Report Incident in Progress** - Rahota Ayyuka
3. **Request Help** - Neman Taimako
4. **Receive Safety Alerts** - Karanta Alerta

### Backend Architecture
- Event-driven, modular microservices pattern
- De-duplication with confidence scoring
- Rules-based escalation engine
- Automatic routing to response desks
- SMS alert notifications
- Graceful degradation (queueing, retries, offline caching)
- Strict rate-limiting to prevent abuse

## Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Database**: MongoDB (primary data store)
- **Cache/Queue**: Redis (rate limiting, session management)
- **Messaging**: Twilio (USSD/SMS)
- **API Documentation**: Swagger UI

## Project Structure

```
incident-report/
├── src/
│   ├── config/           # Configuration
│   ├── models/            # Mongoose models
│   │   ├── Incident.js   # Incident schema
│   │   ├── Alert.js      # Alert schema
│   │   ├── UssdSession.js # USSD session schema
│   │   └── EscalationRule.js # Escalation rules
│   ├── services/          # Business logic
│   │   ├── ussdService.js        # USSD handler
│   │   ├── incidentIngestionService.js
│   │   ├── deduplicationService.js
│   │   ├── escalationService.js
│   │   ├── notificationService.js
│   │   └── rateLimiterService.js
│   ├── routes/            # API routes
│   │   ├── incidents.js  # Incident CRUD
│   │   ├── ussd.js       # USSD webhook
│   │   └── admin.js      # Admin dashboard
│   └── index.js          # Entry point
├── public/
│   ├── admin/            # Admin dashboard (static)
│   │   └── index.html
│   └── mobile/           # Mobile web interface
│       └── index.html
├── tests/                 # Unit tests
├── package.json
├── .env.example
└── README.md
```

## Quick Start

### Prerequisites
- Node.js 18+
- MongoDB 6+
- Redis 7+

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd incident-report

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Edit .env with your configuration
nano .env

# Start development server
npm run dev
```

### Environment Variables

```env
# Server
NODE_ENV=development
PORT=3000

# MongoDB
MONGODB_URI=mongodb://localhost:27017/incident_report

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Twilio (for USSD/SMS)
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+2348000000000

# USSD
USSD_SHORT_CODE=*123#
USSD_SESSION_TIMEOUT_MS=120000

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=10

# Admin
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change_this
```

## API Endpoints

### Incidents

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/incidents` | Submit incident report |
| GET | `/api/v1/incidents` | List incidents with filters |
| GET | `/api/v1/incidents/:id` | Get incident details |
| PATCH | `/api/v1/incidents/:id/status` | Update status |
| POST | `/api/v1/incidents/:id/assign` | Assign to responder |

### USSD

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/ussd` | Twilio webhook |
| POST | `/api/v1/ussd/simulate` | Test endpoint |
| GET | `/api/v1/ussd/session/:id` | Session status |

### Admin

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/admin/dashboard` | Dashboard data |
| GET | `/api/v1/admin/incidents` | All incidents |
| POST | `/api/v1/admin/alerts` | Create alert |
| GET | `/api/v1/admin/analytics` | Analytics |
| POST | `/api/v1/admin/escalation-rules` | Create rule |

## USSD Flow

### Main Menu (Hausa)
```
MATASA Incident Report
1. Rahota Hatsari
2. Rahota Ayyuka
3. Neman Taimako
4. Karanta Alerta
5. Maimaita
```

### Incident Reporting Flow
1. Select incident type
2. Select severity (1-4)
3. Location (auto cell tower / manual)
4. Description (optional)
5. Callback consent (1=Yes, 2=No)
6. Confirm and submit

## Escalation Levels

| Level | Description | SLA |
|-------|-------------|-----|
| 0 | Received, pending review | - |
| 1 | Community focal point | 30 min |
| 2 | Event security team | 30 min |
| 3 | Agency liaison (Police) | 60 min |
| 4 | Senior management | 120 min |
| 5 | Emergency command | Immediate |

## De-duplication

Incidents are automatically checked for duplicates based on:
- **Spatial** (GPS coordinates, village name) - 40% weight
- **Temporal** (time of report) - 30% weight
- **Type** (incident category) - 20% weight
- **Severity** - 10% weight

Duplicate threshold: 60% similarity

## Rate Limiting

| Endpoint | Limit | Window |
|----------|-------|--------|
| USSD | 20 requests | 1 hour |
| API (incidents) | 10 requests | 15 minutes |
| Admin | 100 requests | 15 minutes |

## Deployment

### Production Build

```bash
npm run build
```

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

### Environment Considerations

For rural Nigeria deployment:
- Use SMS/USSD over data connections
- Compress images before upload
- Implement offline queueing
- Use local CDN for static assets
- Partner with local telcos for short codes

## Security

- All reports anonymous by default
- Optional callback consent
- Rate limiting prevents abuse
- No user accounts required at MVP
- Data retention policy enforced

## License

MIT License

## Support

For deployment support, contact the development team.
