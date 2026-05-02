/**
 * Telco CRUD API
 * Stack: Node.js + Express + JSON flat-file DB (drop-in ready, no DB install needed)
 * Hand this folder to Engineering — run `npm install` then `node server.js`
 *
 * Fixes applied:
 *  1. Middleware order fixed — logger first, error handler before 404, 404 fallback last
 *  2. readDB() now auto-creates db.json if missing (no crash on first run)
 *  3. CORS headers added (install: npm install cors)
 *  4. MSISDN input validation added to all :msisdn routes
 *  5. app.listen binds to 0.0.0.0 for public accessibility
 */

const express = require("express");
const cors = require("cors");          // npm install cors
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");

const app = express();

// ─────────────────────────────────────────────
// Global Middleware (must be FIRST)
// ─────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// Request logger — runs before every route
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  console.log("Content-Type:", req.headers["content-type"]);
  if (Object.keys(req.body || {}).length) {
    console.log("Body:", JSON.stringify(req.body));
  }
  next();
});

// ─────────────────────────────────────────────
// DB Helpers
// ─────────────────────────────────────────────
const DB_PATH = path.join(__dirname, "db.json");

function readDB() {
  // FIX: auto-create db.json if it doesn't exist — prevents crash on first run
  if (!fs.existsSync(DB_PATH)) {
    const empty = { customers: [] };
    writeDB(empty);
    return empty;
  }
  try {
    const raw = fs.readFileSync(DB_PATH, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    console.error("Failed to read/parse db.json:", err.message);
    return { customers: [] };
  }
}

function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), "utf8");
}

// ─────────────────────────────────────────────
// Validation Helper
// ─────────────────────────────────────────────
// FIX: validate MSISDN format to block path traversal / junk input
function isValidMSISDN(msisdn) {
  return /^[0-9]{10,15}$/.test(msisdn);
}

// ─────────────────────────────────────────────
// ROUTE: API Index
// GET /
// ─────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({
    name: "Telco CRUD API",
    version: "1.0.0",
    status: "running",
    endpoints: [
      "GET    /health",
      "GET    /customers",
      "GET    /customers/:msisdn",
      "POST   /customers",
      "PATCH  /customers/:msisdn",
      "DELETE /customers/:msisdn",
      "GET    /customers/:msisdn/issues",
      "GET    /customers/:msisdn/issues/:issueId",
      "POST   /customers/:msisdn/issues",
      "PATCH  /customers/:msisdn/issues/:issueId",
    ],
  });
});

// ─────────────────────────────────────────────
// ROUTE: Health Check
// GET /health
// ─────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─────────────────────────────────────────────
// ROUTE: List All Customers OR Single by MSISDN query param
// GET /customers              → all customers
// GET /customers?msisdn=017.. → single customer object
// ─────────────────────────────────────────────
app.get("/customers", (req, res) => {
  const db = readDB();

  if (req.query.msisdn) {
    // FIX: validate query param MSISDN too
    if (!isValidMSISDN(req.query.msisdn)) {
      return res.status(400).json({ error: "Invalid MSISDN format" });
    }
    const customer = db.customers.find((c) => c.msisdn === req.query.msisdn);
    if (!customer) {
      return res.status(404).json({ error: "Customer not found", msisdn: req.query.msisdn });
    }
    return res.json(customer);
  }

  res.json({ count: db.customers.length, customers: db.customers });
});

// ─────────────────────────────────────────────
// ROUTE: Get Single Customer by MSISDN
// GET /customers/:msisdn
// ─────────────────────────────────────────────
app.get("/customers/:msisdn", (req, res) => {
  // FIX: validate MSISDN
  if (!isValidMSISDN(req.params.msisdn)) {
    return res.status(400).json({ error: "Invalid MSISDN format" });
  }

  const db = readDB();
  const customer = db.customers.find((c) => c.msisdn === req.params.msisdn);

  if (!customer) {
    return res.status(404).json({ error: "Customer not found", msisdn: req.params.msisdn });
  }

  res.json(customer);
});

// ─────────────────────────────────────────────
// ROUTE: Create Customer
// POST /customers
// Body: { customer_name, msisdn, package_name, package_type,
//         data_quota_mb, validity_days, current_balance }
// ─────────────────────────────────────────────
app.post("/customers", (req, res) => {
  const {
    customer_name,
    msisdn,
    package_name,
    package_type,
    data_quota_mb,
    validity_days,
    current_balance,
  } = req.body;

  if (!customer_name || !msisdn || !package_name) {
    return res.status(400).json({
      error: "Required fields: customer_name, msisdn, package_name",
    });
  }

  // FIX: validate MSISDN in body too
  if (!isValidMSISDN(msisdn)) {
    return res.status(400).json({ error: "Invalid MSISDN format" });
  }

  const db = readDB();

  const duplicate = db.customers.find((c) => c.msisdn === msisdn);
  if (duplicate) {
    return res.status(409).json({ error: "MSISDN already registered" });
  }

  const newCustomer = {
    id: "cust-" + randomUUID().split("-")[0],
    customer_name,
    msisdn,
    package_name: package_name || "Basic Prepaid",
    package_type: package_type || "prepaid",
    data_quota_mb: data_quota_mb || 1024,
    validity_days: validity_days || 30,
    current_balance: current_balance || 0,
    last_flexiload_date: null,
    last_trxid: null,
    reported_issues: [],
  };

  db.customers.push(newCustomer);
  writeDB(db);

  res.status(201).json({ message: "Customer created", customer: newCustomer });
});

// ─────────────────────────────────────────────
// ROUTE: Update Customer Details
// PATCH /customers/:msisdn
// Body: any subset of updatable fields
// ─────────────────────────────────────────────
app.patch("/customers/:msisdn", (req, res) => {
  // FIX: validate MSISDN
  if (!isValidMSISDN(req.params.msisdn)) {
    return res.status(400).json({ error: "Invalid MSISDN format" });
  }

  const db = readDB();
  const customerIndex = db.customers.findIndex(
    (c) => c.msisdn === req.params.msisdn
  );

  if (customerIndex === -1) {
    return res.status(404).json({ error: "Customer not found", msisdn: req.params.msisdn });
  }

  const ALLOWED_FIELDS = [
    "customer_name",
    "package_name",
    "package_type",
    "data_quota_mb",
    "validity_days",
    "current_balance",
    "last_flexiload_date",
    "last_trxid",
  ];

  const updates = {};
  for (const field of ALLOWED_FIELDS) {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: "No valid fields provided for update" });
  }

  db.customers[customerIndex] = {
    ...db.customers[customerIndex],
    ...updates,
  };

  writeDB(db);

  res.json({
    message: "Customer updated",
    customer: db.customers[customerIndex],
  });
});

// ─────────────────────────────────────────────
// ROUTE: Delete Customer
// DELETE /customers/:msisdn
// ─────────────────────────────────────────────
app.delete("/customers/:msisdn", (req, res) => {
  // FIX: validate MSISDN
  if (!isValidMSISDN(req.params.msisdn)) {
    return res.status(400).json({ error: "Invalid MSISDN format" });
  }

  const db = readDB();
  const index = db.customers.findIndex((c) => c.msisdn === req.params.msisdn);

  if (index === -1) {
    return res.status(404).json({ error: "Customer not found" });
  }

  const removed = db.customers.splice(index, 1);
  writeDB(db);

  res.json({ message: "Customer deleted", customer: removed[0] });
});

// ─────────────────────────────────────────────
// ROUTE: Get All Issues for a Customer
// GET /customers/:msisdn/issues
// ─────────────────────────────────────────────
app.get("/customers/:msisdn/issues", (req, res) => {
  // FIX: validate MSISDN
  if (!isValidMSISDN(req.params.msisdn)) {
    return res.status(400).json({ error: "Invalid MSISDN format" });
  }

  const db = readDB();
  const customer = db.customers.find((c) => c.msisdn === req.params.msisdn);

  if (!customer) {
    return res.status(404).json({ error: "Customer not found", msisdn: req.params.msisdn });
  }

  res.json({
    msisdn: customer.msisdn,
    customer_name: customer.customer_name,
    total_issues: customer.reported_issues.length,
    issues: customer.reported_issues,
  });
});

// ─────────────────────────────────────────────
// ROUTE: Get Single Issue
// GET /customers/:msisdn/issues/:issueId
// ─────────────────────────────────────────────
app.get("/customers/:msisdn/issues/:issueId", (req, res) => {
  // FIX: validate MSISDN
  if (!isValidMSISDN(req.params.msisdn)) {
    return res.status(400).json({ error: "Invalid MSISDN format" });
  }

  const db = readDB();
  const customer = db.customers.find((c) => c.msisdn === req.params.msisdn);

  if (!customer) {
    return res.status(404).json({ error: "Customer not found", msisdn: req.params.msisdn });
  }

  const issue = customer.reported_issues.find(
    (i) => i.issue_id === req.params.issueId
  );

  if (!issue) {
    return res.status(404).json({ error: "Issue not found" });
  }

  res.json(issue);
});

// ─────────────────────────────────────────────
// ROUTE: Log a Complaint
// POST /customers/:msisdn/issues
// Body: { issue_type, description }
// issue_type: "billing" | "network" | "data" | "recharge" | "other"
// ─────────────────────────────────────────────
app.post("/customers/:msisdn/issues", (req, res) => {
  // FIX: validate MSISDN
  if (!isValidMSISDN(req.params.msisdn)) {
    return res.status(400).json({ error: "Invalid MSISDN format" });
  }

  const { issue_type, description } = req.body;
  const VALID_ISSUE_TYPES = ["billing", "network", "data", "recharge", "other"];

  if (!issue_type || !description) {
    return res.status(400).json({
      error: "Required fields: issue_type, description",
    });
  }

  if (!VALID_ISSUE_TYPES.includes(issue_type)) {
    return res.status(400).json({
      error: `issue_type must be one of: ${VALID_ISSUE_TYPES.join(", ")}`,
    });
  }

  const db = readDB();
  const customerIndex = db.customers.findIndex(
    (c) => c.msisdn === req.params.msisdn
  );

  if (customerIndex === -1) {
    return res.status(404).json({ error: "Customer not found" });
  }

  const newIssue = {
    issue_id: "ISS-" + randomUUID().split("-")[0].toUpperCase(),
    issue_type,
    description,
    status: "open",
    reported_at: new Date().toISOString(),
  };

  db.customers[customerIndex].reported_issues.push(newIssue);
  writeDB(db);

  res.status(201).json({
    message: "Issue logged successfully",
    issue: newIssue,
    msisdn: db.customers[customerIndex].msisdn,
    customer_name: db.customers[customerIndex].customer_name,
  });
});

// ─────────────────────────────────────────────
// ROUTE: Update Issue Status
// PATCH /customers/:msisdn/issues/:issueId
// Body: { status } → "open" | "in_progress" | "resolved" | "closed"
// ─────────────────────────────────────────────
app.patch("/customers/:msisdn/issues/:issueId", (req, res) => {
  // FIX: validate MSISDN
  if (!isValidMSISDN(req.params.msisdn)) {
    return res.status(400).json({ error: "Invalid MSISDN format" });
  }

  const { status } = req.body;
  const VALID_STATUSES = ["open", "in_progress", "resolved", "closed"];

  if (!status || !VALID_STATUSES.includes(status)) {
    return res.status(400).json({
      error: `status must be one of: ${VALID_STATUSES.join(", ")}`,
    });
  }

  const db = readDB();
  const customerIndex = db.customers.findIndex(
    (c) => c.msisdn === req.params.msisdn
  );

  if (customerIndex === -1) {
    return res.status(404).json({ error: "Customer not found" });
  }

  const issueIndex = db.customers[customerIndex].reported_issues.findIndex(
    (i) => i.issue_id === req.params.issueId
  );

  if (issueIndex === -1) {
    return res.status(404).json({ error: "Issue not found" });
  }

  db.customers[customerIndex].reported_issues[issueIndex].status = status;
  writeDB(db);

  res.json({
    message: "Issue status updated",
    issue: db.customers[customerIndex].reported_issues[issueIndex],
  });
});

// ─────────────────────────────────────────────
// FIX: Error handler BEFORE 404 fallback
// Catches malformed JSON bodies and other thrown errors
// ─────────────────────────────────────────────
app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Invalid JSON body" });
  }
  console.error("Unhandled error:", err.message);
  res.status(500).json({ error: "Internal server error" });
});

// ─────────────────────────────────────────────
// FIX: 404 fallback LAST — after error handler
// ─────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// ─────────────────────────────────────────────
// Start Server
// FIX: bind to 0.0.0.0 so it's publicly accessible (not just localhost)
// ─────────────────────────────────────────────
const PORT = process.env.PORT || 8000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n🚀 Telco API running on http://0.0.0.0:${PORT}`);
  console.log(`📋 Routes:`);
  console.log(`   GET    /`);
  console.log(`   GET    /health`);
  console.log(`   GET    /customers`);
  console.log(`   GET    /customers/:msisdn`);
  console.log(`   POST   /customers`);
  console.log(`   PATCH  /customers/:msisdn`);
  console.log(`   DELETE /customers/:msisdn`);
  console.log(`   GET    /customers/:msisdn/issues`);
  console.log(`   GET    /customers/:msisdn/issues/:issueId`);
  console.log(`   POST   /customers/:msisdn/issues`);
  console.log(`   PATCH  /customers/:msisdn/issues/:issueId\n`);
});