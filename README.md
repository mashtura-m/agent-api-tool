# Telco CRUD API

> **Testing-purpose REST API** for a Telco customer database.  
> Stack: **Node.js 18+ · Express · JSON flat-file DB** — no database install required.

---

## Quick Start

```bash
npm install
node server.js
# → Server starts on http://localhost:3000
```

Set a custom port:
```bash
PORT=8080 node server.js
```

---

## Database Schema

Each customer record in `db.json` has the following shape:

| Field | Type | Description |
|---|---|---|
| `id` | string | Auto-generated unique ID (`cust-xxxx`) |
| `customer_name` | string | Full name of the subscriber |
| `msisdn` | string | Mobile number / P-number (must be unique) |
| `package_name` | string | Active package name (e.g. "Super Data 30") |
| `package_type` | string | `prepaid` or `postpaid` |
| `data_quota_mb` | number | Data allowance in MB |
| `validity_days` | number | Package validity in days |
| `current_balance` | number | Current BDT balance |
| `last_flexiload_date` | string (ISO) | Timestamp of last recharge / flexiload |
| `last_trxid` | string | Last transaction ID |
| `reported_issues` | array | List of complaint objects (see below) |

### Issue Object

| Field | Type | Description |
|---|---|---|
| `issue_id` | string | Auto-generated (`ISS-XXXX`) |
| `issue_type` | string | `billing` · `network` · `data` · `recharge` · `other` |
| `description` | string | Free-text description of the complaint |
| `status` | string | `open` · `in_progress` · `resolved` · `closed` |
| `reported_at` | string (ISO) | Timestamp when issue was logged |

---

## API Reference

### Health Check
```
GET /health
```
**Response:**
```json
{ "status": "ok", "timestamp": "2026-05-01T10:00:00.000Z" }
```

---

### List All Customers
```
GET /customers
GET /customers?msisdn=01711234567    ← filter by MSISDN
```

---

### Get Single Customer
```
GET /customers/:id
```

---

### Create a Customer
```
POST /customers
Content-Type: application/json
```
**Body:**
```json
{
  "customer_name": "Nadia Islam",
  "msisdn": "01755667788",
  "package_name": "Super Data 30",
  "package_type": "prepaid",
  "data_quota_mb": 30720,
  "validity_days": 30,
  "current_balance": 200.00
}
```
**Required:** `customer_name`, `msisdn`, `package_name`  
**Response:** `201 Created` with the new customer object.

---

### Update Customer Details
```
PATCH /customers/:id
Content-Type: application/json
```
**Body** (send only the fields you want to change):
```json
{
  "current_balance": 350.00,
  "last_flexiload_date": "2026-05-01T09:00:00Z",
  "last_trxid": "TRX20260501090012X",
  "package_name": "Night Data 15"
}
```
**Updatable fields:** `customer_name`, `package_name`, `package_type`, `data_quota_mb`, `validity_days`, `current_balance`, `last_flexiload_date`, `last_trxid`

---

### Log a Complaint
```
POST /customers/:id/issues
Content-Type: application/json
```
**Body:**
```json
{
  "issue_type": "billing",
  "description": "Customer was charged twice for the same flexiload on 30 April"
}
```
**Response:** `201 Created` with the new issue object + customer MSISDN.

---

### Update Issue Status
```
PATCH /customers/:id/issues/:issueId
Content-Type: application/json
```
**Body:**
```json
{ "status": "resolved" }
```
**Valid statuses:** `open` · `in_progress` · `resolved` · `closed`

---

### Delete a Customer
```
DELETE /customers/:id
```
**Response:** Deleted customer object.

---

## Example cURL Commands

```bash
# 1. Health check
curl http://localhost:3000/health

# 2. List all customers
curl http://localhost:3000/customers

# 3. Find by MSISDN
curl "http://localhost:3000/customers?msisdn=01711234567"

# 4. Create a customer
curl -X POST http://localhost:3000/customers \
  -H "Content-Type: application/json" \
  -d '{"customer_name":"Nadia Islam","msisdn":"01755667788","package_name":"Super Data 30","current_balance":200}'

# 5. Update balance after flexiload
curl -X PATCH http://localhost:3000/customers/cust-001 \
  -H "Content-Type: application/json" \
  -d '{"current_balance":350,"last_flexiload_date":"2026-05-01T09:00:00Z","last_trxid":"TRX20260501090012X"}'

# 6. Log a complaint
curl -X POST http://localhost:3000/customers/cust-001/issues \
  -H "Content-Type: application/json" \
  -d '{"issue_type":"network","description":"No data service in Mirpur-10 area since morning"}'

# 7. Resolve the issue
curl -X PATCH http://localhost:3000/customers/cust-001/issues/ISS-XXXX \
  -H "Content-Type: application/json" \
  -d '{"status":"resolved"}'
```

---

## HTTP Status Codes Used

| Code | Meaning |
|---|---|
| 200 | Success |
| 201 | Resource created |
| 400 | Bad request / missing required fields |
| 404 | Customer or issue not found |
| 409 | Conflict (duplicate MSISDN) |

---

## For Engineering: Deployment Notes

- **No database setup needed** — data lives in `db.json` alongside the server.
- To swap to a real DB (PostgreSQL, MySQL, MongoDB), replace the `readDB()` / `writeDB()` helper functions in `server.js` with your ORM queries — all route logic stays the same.
- For production, wrap with `pm2` or a Docker container and add authentication middleware (JWT or API key).
- Pre-seeded with 3 dummy customers for immediate testing.
