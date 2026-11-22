# FixMate Server

REST API for **FixMate**, a smart device and home appliance repair service booking platform.
Customers book verified technicians, track every job step by step, and pay online only after the job is completed.

## Live URLs

- Live Site: YOUR_CLIENT_LIVE_URL
- Server API: YOUR_SERVER_LIVE_URL
- Client Repository: YOUR_CLIENT_GITHUB_URL

## Test Accounts

| Role | Email | Password |
| --- | --- | --- |
| Admin | YOUR_ADMIN_EMAIL | YOUR_ADMIN_PASSWORD |
| Technician | YOUR_TECHNICIAN_EMAIL | YOUR_TECHNICIAN_PASSWORD |
| Customer | YOUR_CUSTOMER_EMAIL | YOUR_CUSTOMER_PASSWORD |

Stripe test card: `4242 4242 4242 4242`, any future date, any CVC.

## Key Features

- JWT verification with role-based middlewares: `verifyToken`, `verifyCustomer`, `verifyTechnician`, `verifyAdmin` (401 and 403 responses)
- Server-side search, filter, sort and pagination for services (MongoDB)
- Technician service CRUD; editing a service sends it back for admin approval
- Booking creation with business rules (no duplicate active request, no own-service request)
- Server-enforced job status pipeline: requested, accepted, in-progress, completed
- Stripe Checkout (test mode) with a payment gate: only a completed and unpaid booking owned by the customer can be paid
- Payment verification and Stripe webhook with duplicate payment protection (unique indexes)
- Admin APIs for users, roles, service approval, bookings, payments and stats
- Seed script with realistic demo data

## Collections

`users` (BetterAuth user collection), `services`, `bookings`, `payments`

## Environment Variables

Copy `.env.example` to `.env` and fill in the values.

| Name | Purpose |
| --- | --- |
| PORT | Server port (default 5000) |
| CLIENT_URL | Allowed client URLs for CORS, comma separated |
| MONGODB_URI | MongoDB connection string |
| DB_NAME | Database name |
| JWT_SECRET | Secret for verifying JWT (same as the client) |
| STRIPE_SECRET_KEY | Stripe secret key (test mode) |
| STRIPE_WEBHOOK_SECRET | Stripe webhook signing secret |

## Run Locally

```bash
npm install
npm run dev
```

## Seed Demo Data

Create 2 technician accounts and 1 customer account from the client Sign Up page first, then:

```bash
npm run seed
```

This adds 14 approved services, 1 pending service, 1 rejected service, bookings in different statuses and payment records.
Running it again replaces only the seeded data.

## Main API Routes

| Method | Route | Access |
| --- | --- | --- |
| GET | /api/services, /api/services/:id | Public |
| POST | /api/services | Technician |
| GET | /api/services/mine | Technician |
| PATCH, DELETE | /api/services/:id | Technician (owner) |
| PATCH | /api/services/:id/availability | Technician (owner) |
| POST | /api/bookings | Customer |
| GET | /api/bookings/my | Customer |
| PATCH | /api/bookings/:id/cancel | Customer (owner) |
| GET | /api/bookings/technician | Technician |
| PATCH | /api/bookings/:id/status | Technician (owner) |
| POST | /api/payments/create-checkout-session | Customer |
| GET | /api/payments/verify, /api/payments/my | Customer |
| POST | /api/payments/webhook | Stripe |
| GET | /api/admin/stats, users, services, bookings, payments | Admin |
| PATCH | /api/admin/users/:id/role | Admin |
| PATCH | /api/admin/services/:id/approval | Admin |
| PATCH | /api/users/profile | Any logged-in user |

## npm Packages

express, cors, dotenv, mongodb, jsonwebtoken, stripe, nodemon (dev)