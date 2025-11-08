# Frontend Environment Setup

This document explains how to configure environment variables for the frontend application.

## Environment Variables

The frontend uses the following environment variables:

- `VITE_API_URL`: The base URL for API requests (default: `http://localhost:4000`)
- `VITE_SOCKET_URL`: The URL for Socket.IO connections (default: `http://localhost:4000`)

## Setup Instructions

1. **Copy the example file** (if .env doesn't exist):
   ```bash
   cp .env.example .env
   ```

2. **Edit the .env file** and update the URLs according to your backend server:
   - For local development: `http://localhost:4000`
   - For production: `https://your-domain.com`
   - For different backend ports: `http://localhost:YOUR_PORT`

3. **Restart your development server** after making changes to the .env file

## Usage in Code

The environment variables are automatically loaded by Vite and can be accessed using:
```javascript
import.meta.env.VITE_API_URL
import.meta.env.VITE_SOCKET_URL
```

## Security Notes

- Never commit the `.env` file to version control
- The `.env.example` file shows the required variables without sensitive data
- Always use environment variables for API URLs instead of hardcoding them