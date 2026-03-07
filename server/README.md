# FaceMash Backend (OAuth + KYC)

## What it does

- OAuth login with Google and Apple
- Session-based authentication
- KYC submission endpoint with identity document upload
- Age-of-majority validation per country
- SQLite storage for users and KYC submissions

## Setup

1. `cd server`
2. `npm install`
3. Copy `.env.example` to `.env` and fill all OAuth credentials
4. `npm run dev`

## Required env vars

- `FRONTEND_ORIGIN`
- `SESSION_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `APPLE_CLIENT_ID`
- `APPLE_TEAM_ID`
- `APPLE_KEY_ID`
- `APPLE_PRIVATE_KEY`
- `APPLE_REDIRECT_URI`

## API

- `GET /api/health`
- `GET /api/me`
- `POST /api/kyc/submit` (multipart, requires auth)
- `GET /auth/google`
- `GET /auth/google/callback`
- `GET /auth/apple`
- `POST /auth/apple/callback`
- `GET /auth/logout`

## Production note

KYC data is sensitive personal data. You must deploy with:

- encrypted object storage for documents
- strict access control
- retention policy and deletion workflow
- legal compliance (GDPR/CCPA + identity verification laws)
