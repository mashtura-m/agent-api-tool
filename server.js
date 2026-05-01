/**
 * Telco CRUD API
 * Stack: Node.js + Express + JSON flat-file DB (drop-in ready, no DB install needed)
 * Hand this folder to Engineering — run `npm install` then `node server.js`
 */

const express = require("express");
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto"); // built-in Node 14.17+ — no install needed

const app = express();
app.use(express.json());

const DB_PATH = path.join(__dirname, "db.json");

// ─────────────────────────────────────────────
// DB Helpers (reads/writes db.json atomically)
// ─────────────────────────────────────────────
function readDB() {
  const raw = fs.readFileSync(DB_PATH, "utf8");
  return JSON.parse(raw);
}

function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), "utf8");
}

function findCustomer(db, id) {
  return db.customers.find((c) => c.id === id);
}

// ─────────────────────────────────────────────
// ROUTE: Health Check
// GET /health
// ─────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─────────────────────────────────────────────
// ROUTE: List All Customers
// GET /customers
// Optional query: ?msisdn=017...  for quick lookup
// ─────────────────────────────────────────────
app.get("/customers", (req, res) => {
  const db = readDB();
  let result = db.customers;

  if (req.query.msisdn) {
    result = result.filter((c) => c.msisdn === req.query.msisdn);
  }

  res.json({ count: result.length, customers: result });
});

// ─────────────────────────────────────────────
// ROUTE: Get Single Customer
// GET /customers/:id
// ─────────────────────────────────────────────
app.get("/customers/:id", (req, res) => {
  const db = readDB();
  const customer = findCustomer(db, req.params.id);

  if (!customer) {
    return res.status(404).json({ error: "Customer not found" });
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

  // Validation
  if (!customer_name || !msisdn || !package_name) {
    return res.status(400).json({
      error: "Required fields: customer_name, msisdn, package_name",
    });
  }

  const db = readDB();

  // MSISDN must be unique
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
// PATCH /customers/:id
// Body: any subset of updatable fields
// Updatable: customer_name, package_name, package_type,
//            data_quota_mb, validity_days, current_balance,
//            last_flexiload_date, last_trxid
// ─────────────────────────────────────────────
app.patch("/customers/:id", (req, res) => {
  const db = readDB();
  const customerIndex = db.customers.findIndex((c) => c.id === req.params.id);

  if (customerIndex === -1) {
    return res.status(404).json({ error: "Customer not found" });
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
// ROUTE: Log a Complaint / Report Issue
// POST /customers/:id/issues
// Body: { issue_type, description }
// issue_type: "billing" | "network" | "data" | "recharge" | "other"
// ─────────────────────────────────────────────
app.post("/customers/:id/issues", (req, res) => {
  const { issue_type, description } = req.body;

  if (!issue_type || !description) {
    return res.status(400).json({
      error: "Required fields: issue_type, description",
    });
  }

  const db = readDB();
  const customerIndex = db.customers.findIndex((c) => c.id === req.params.id);

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
    customer_id: req.params.id,
    msisdn: db.customers[customerIndex].msisdn,
  });
});

// ─────────────────────────────────────────────
// ROUTE: Update Issue Status
// PATCH /customers/:id/issues/:issueId
// Body: { status }  → "open" | "in_progress" | "resolved" | "closed"
// ─────────────────────────────────────────────
app.patch("/customers/:id/issues/:issueId", (req, res) => {
  const { status } = req.body;
  const VALID_STATUSES = ["open", "in_progress", "resolved", "closed"];

  if (!status || !VALID_STATUSES.includes(status)) {
    return res.status(400).json({
      error: `status must be one of: ${VALID_STATUSES.join(", ")}`,
    });
  }

  const db = readDB();
  const customerIndex = db.customers.findIndex((c) => c.id === req.params.id);

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
// ROUTE: Delete Customer
// DELETE /customers/:id
// ─────────────────────────────────────────────
app.delete("/customers/:id", (req, res) => {
  const db = readDB();
  const index = db.customers.findIndex((c) => c.id === req.params.id);

  if (index === -1) {
    return res.status(404).json({ error: "Customer not found" });
  }

  const removed = db.customers.splice(index, 1);
  writeDB(db);

  res.json({ message: "Customer deleted", customer: removed[0] });
});

// ─────────────────────────────────────────────
// 404 Fallback
// ─────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// ─────────────────────────────────────────────
// Start Server
// ─────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 Telco API running on http://localhost:${PORT}`);
  console.log(`📋 Routes:`);
  console.log(`   GET    /health`);
  console.log(`   GET    /customers`);
  console.log(`   GET    /customers/:id`);
  console.log(`   POST   /customers`);
  console.log(`   PATCH  /customers/:id`);
  console.log(`   DELETE /customers/:id`);
  console.log(`   POST   /customers/:id/issues`);
  console.log(`   PATCH  /customers/:id/issues/:issueId\n`);
});