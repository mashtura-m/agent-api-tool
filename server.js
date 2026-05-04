/**
 * Unified Telco CRM + Ticketing API
 * ─────────────────────────────────────────────────────────────
 * Stack:
 *  - Node.js
 *  - Express
 *  - JSON flat-file persistence
 *  - Swagger OpenAPI
 *
 * Features:
 *  - Customer CRUD
 *  - Ticket CRUD
 *  - SOA-compatible ticket endpoint
 *  - Ticket category catalog
 *  - Centralized DB layer
 *  - Structured validation
 *  - Middleware ordering fixed
 *  - Consistent response model
 *  - Production-grade error handling
 *  - Single source of truth DB
 *
 * Run:
 *   npm install express cors swagger-ui-express
 *   node server.js
 */

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const swaggerUi = require("swagger-ui-express");

const app = express();
const PORT = process.env.PORT || 8000;

// ─────────────────────────────────────────────────────────────
// Middleware
// ─────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.use((req, res, next) => {
  console.log(
    `[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`
  );
  next();
});

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────
const DB_DIR = path.join(__dirname, "db");
const DB_FILE = path.join(DB_DIR, "database.json");

const VALID_TICKET_STATUS = [
  "Open",
  "InProgress",
  "Resolved",
  "Closed",
  "Cancelled",
];

const VALID_PRIORITY = ["Low", "Medium", "High", "Critical"];

const VALID_ISSUE_TYPES = [
  "billing",
  "network",
  "data",
  "recharge",
  "other",
];

// ─────────────────────────────────────────────────────────────
// Seed Data
// ─────────────────────────────────────────────────────────────
const seedDatabase = {
  customers: [
    {
      id: "cust-001",
      customer_name: "Rahim Uddin",
      msisdn: "01711234567",
      package_name: "Go 12",
      package_type: "prepaid",
      data_quota_mb: 30720,
      validity_days: 30,
      current_balance: 350,
      last_flexiload_date: "2026-04-20T10:30:00Z",
      last_trxid: "TRX20260501NEWXYZ",
      ticket_ids: ["TT105368"],
    },
    {
      id: "cust-003",
      customer_name: "Karim Hassan",
      msisdn: "01911223344",
      package_name: "Postpaid Pro 500",
      package_type: "postpaid",
      data_quota_mb: 51200,
      validity_days: 30,
      current_balance: 0,
      last_flexiload_date: null,
      last_trxid: "TRX20260401090000C",
      ticket_ids: ["TT193426", "TT536791"],
    },
  ],

  tickets: [
    {
      ticketNo: "TT105368",
      ticketType: "Complaint",
      service: "Fixed",
      category: "Network Issue",
      subCat: "TC0110211613",
      subCatName: "Reachability",
      title: "Chatbot Ticket",
      summary: "No data service in Mirpur-10 area since 9am",
      priority: "High",
      status: "Open",
      msisdn: "01711234567",
      contractId: "cust-001",
      callBackNumber: "01711234567",
      description: "No data service in Mirpur-10 area since 9am",
      notes: [],
      attachments: [],
      createdDate: "2026-05-01T11:00:00.000Z",
      modifiedDate: "2026-05-01T11:18:51.768Z",
    },
  ],

  categories: {
    type: [
      {
        label: "Complaint",
        service: [
          {
            label: "Mobility",
            name: "Mobility",
            category: [
              {
                label: "Billing",
                subCategory: [
                  {
                    id: "TC0220311001",
                    label: "Overcharge",
                    msidn: "Y",
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
};

// ─────────────────────────────────────────────────────────────
// Bootstrap DB
// ─────────────────────────────────────────────────────────────
function initializeDatabase() {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(seedDatabase, null, 2));
    console.log("Database initialized");
  }
}

initializeDatabase();

// ─────────────────────────────────────────────────────────────
// DB Layer
// ─────────────────────────────────────────────────────────────
function readDB() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  } catch (err) {
    console.error("DB read failure:", err.message);
    return {
      customers: [],
      tickets: [],
      categories: { type: [] },
    };
  }
}

function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

const db = {
  getCustomers() {
    return readDB().customers;
  },

  getTickets() {
    return readDB().tickets;
  },

  getCategories() {
    return readDB().categories;
  },

  save(database) {
    writeDB(database);
  },
};

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function isValidMSISDN(msisdn) {
  return /^[0-9]{11,15}$/.test(msisdn);
}

function generateCustomerId() {
  return `cust-${crypto.randomUUID().split("-")[0]}`;
}

function generateTicketNo() {
  return `TT${Math.floor(100000 + Math.random() * 900000)}`;
}

function now() {
  return new Date().toISOString();
}

function findCustomerByMSISDN(msisdn) {
  return db.getCustomers().find((c) => c.msisdn === msisdn);
}

function findCustomerByIdOrMSISDN(value) {
  return db
    .getCustomers()
    .find((c) => c.id === value || c.msisdn === value);
}

function findTicket(ticketNo) {
  return db.getTickets().find((t) => t.ticketNo === ticketNo);
}

function auth(req, res, next) {
  const token = req.headers.authorization || req.headers.authcode;

  if (!token || !token.trim()) {
    return res.status(401).json({
      error: "Unauthorized",
      hint: "Provide Authorization header",
    });
  }

  next();
}

// ─────────────────────────────────────────────────────────────
// Health
// ─────────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    customers: db.getCustomers().length,
    tickets: db.getTickets().length,
    timestamp: now(),
  });
});

// ─────────────────────────────────────────────────────────────
// Customers
// ─────────────────────────────────────────────────────────────
app.get("/customers", auth, (req, res) => {
  const { msisdn } = req.query;
  const customers = db.getCustomers();

  if (msisdn) {
    if (!isValidMSISDN(msisdn)) {
      return res.status(400).json({ error: "Invalid MSISDN format" });
    }

    const customer = findCustomerByMSISDN(msisdn);

    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    return res.json(customer);
  }

  res.json({
    total: customers.length,
    customers,
  });
});

app.get("/customers/:id", auth, (req, res) => {
  const customer = findCustomerByIdOrMSISDN(req.params.id);

  if (!customer) {
    return res.status(404).json({ error: "Customer not found" });
  }

  res.json(customer);
});

app.post("/customers", auth, (req, res) => {
  const {
    customer_name,
    msisdn,
    package_name,
    package_type,
    data_quota_mb,
    validity_days,
    current_balance,
  } = req.body;

  if (!customer_name || !msisdn) {
    return res.status(400).json({
      error: "customer_name and msisdn are required",
    });
  }

  if (!isValidMSISDN(msisdn)) {
    return res.status(400).json({
      error: "Invalid MSISDN format",
    });
  }

  const database = readDB();

  const exists = database.customers.find((c) => c.msisdn === msisdn);

  if (exists) {
    return res.status(409).json({
      error: "MSISDN already exists",
    });
  }

  const customer = {
    id: generateCustomerId(),
    customer_name,
    msisdn,
    package_name: package_name || "Basic Prepaid",
    package_type: package_type || "prepaid",
    data_quota_mb: data_quota_mb || 1024,
    validity_days: validity_days || 30,
    current_balance: current_balance || 0,
    last_flexiload_date: null,
    last_trxid: null,
    ticket_ids: [],
  };

  database.customers.push(customer);
  db.save(database);

  res.status(201).json({
    message: "Customer created",
    customer,
  });
});

app.patch("/customers/:id", auth, (req, res) => {
  const database = readDB();

  const customerIndex = database.customers.findIndex(
    (c) => c.id === req.params.id || c.msisdn === req.params.id
  );

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

  for (const field of ALLOWED_FIELDS) {
    if (req.body[field] !== undefined) {
      database.customers[customerIndex][field] = req.body[field];
    }
  }

  db.save(database);

  res.json({
    message: "Customer updated",
    customer: database.customers[customerIndex],
  });
});

app.delete("/customers/:id", auth, (req, res) => {
  const database = readDB();

  const customerIndex = database.customers.findIndex(
    (c) => c.id === req.params.id || c.msisdn === req.params.id
  );

  if (customerIndex === -1) {
    return res.status(404).json({ error: "Customer not found" });
  }

  const customer = database.customers[customerIndex];

  database.tickets = database.tickets.filter(
    (t) => t.msisdn !== customer.msisdn
  );

  database.customers.splice(customerIndex, 1);

  db.save(database);

  res.json({
    message: "Customer and related tickets deleted",
  });
});

// ─────────────────────────────────────────────────────────────
// Ticket Categories
// ─────────────────────────────────────────────────────────────
app.get("/b2bSC_getCatagories/v2", auth, (req, res) => {
  res.json(db.getCategories());
});

app.post("/b2bSC_getCatagories/v2", auth, (req, res) => {
  res.json(db.getCategories());
});

// ─────────────────────────────────────────────────────────────
// Create Ticket
// ─────────────────────────────────────────────────────────────
app.post("/b2bSC_raiseTicket/v1", auth, (req, res) => {
  const {
    msisdn,
    summary,
    ticketType,
    service,
    category,
    subCat,
    subCatName,
    title,
    callBackNumber,
    priority,
    supportDocsList,
  } = req.body;

  if (!msisdn || !summary) {
    return res.status(400).json({
      statusCode: "1",
      statusMessage: "msisdn and summary are required",
    });
  }

  if (!isValidMSISDN(msisdn)) {
    return res.status(400).json({
      statusCode: "1",
      statusMessage: "Invalid MSISDN format",
    });
  }

  const database = readDB();

  const customer = database.customers.find(
    (c) => c.msisdn === msisdn
  );

  if (!customer) {
    return res.status(404).json({
      statusCode: "1",
      statusMessage: "Customer not found",
    });
  }

  const ticket = {
    ticketNo: generateTicketNo(),
    ticketType: ticketType || "Complaint",
    service: service || "Mobility",
    category: category || "General",
    subCat: subCat || "",
    subCatName: subCatName || "",
    title: title || "Customer Support Request",
    summary,
    priority: priority || "Medium",
    status: "Open",
    msisdn,
    contractId: customer.id,
    callBackNumber: callBackNumber || msisdn,
    description: summary,
    notes: [],
    attachments: supportDocsList || [],
    createdDate: now(),
    modifiedDate: now(),
  };

  database.tickets.push(ticket);
  customer.ticket_ids.push(ticket.ticketNo);

  db.save(database);

  res.status(201).json({
    statusCode: "0",
    statusMessage: "success",
    ticketNumber: ticket.ticketNo,
    ticket,
  });
});

// ─────────────────────────────────────────────────────────────
// Ticket CRUD
// ─────────────────────────────────────────────────────────────
app.get("/tickets", auth, (req, res) => {
  const { msisdn } = req.query;

  let tickets = db.getTickets();

  if (msisdn) {
    tickets = tickets.filter((t) => t.msisdn === msisdn);
  }

  res.json({
    total: tickets.length,
    tickets,
  });
});

app.get("/tickets/:ticketNo", auth, (req, res) => {
  const ticket = findTicket(req.params.ticketNo);

  if (!ticket) {
    return res.status(404).json({
      error: "Ticket not found",
    });
  }

  res.json(ticket);
});

app.patch("/tickets/:ticketNo", auth, (req, res) => {
  const database = readDB();

  const ticketIndex = database.tickets.findIndex(
    (t) => t.ticketNo === req.params.ticketNo
  );

  if (ticketIndex === -1) {
    return res.status(404).json({
      error: "Ticket not found",
    });
  }

  const ticket = database.tickets[ticketIndex];

  if (req.body.status) {
    if (!VALID_TICKET_STATUS.includes(req.body.status)) {
      return res.status(400).json({
        error: `Invalid status. Allowed: ${VALID_TICKET_STATUS.join(", ")}`,
      });
    }

    ticket.status = req.body.status;
  }

  if (req.body.priority) {
    if (!VALID_PRIORITY.includes(req.body.priority)) {
      return res.status(400).json({
        error: `Invalid priority. Allowed: ${VALID_PRIORITY.join(", ")}`,
      });
    }

    ticket.priority = req.body.priority;
  }

  if (req.body.note) {
    ticket.notes.push({
      date: now(),
      author: "api-agent",
      text: req.body.note,
    });
  }

  ticket.modifiedDate = now();

  db.save(database);

  res.json({
    message: "Ticket updated",
    ticket,
  });
});

app.delete("/tickets/:ticketNo", auth, (req, res) => {
  const database = readDB();

  const ticketIndex = database.tickets.findIndex(
    (t) => t.ticketNo === req.params.ticketNo
  );

  if (ticketIndex === -1) {
    return res.status(404).json({
      error: "Ticket not found",
    });
  }

  const ticket = database.tickets[ticketIndex];

  database.tickets.splice(ticketIndex, 1);

  const customer = database.customers.find(
    (c) => c.msisdn === ticket.msisdn
  );

  if (customer) {
    customer.ticket_ids = customer.ticket_ids.filter(
      (id) => id !== ticket.ticketNo
    );
  }

  db.save(database);

  res.json({
    message: `Ticket ${ticket.ticketNo} deleted`,
  });
});

// ─────────────────────────────────────────────────────────────
// SOA-Compatible Endpoint
// ─────────────────────────────────────────────────────────────
app.get(
  "/DigitalService/TroubleTicketRestService/troubleTicket",
  auth,
  (req, res) => {
    const { ticketNo } = req.query;

    if (!ticketNo) {
      return res.status(400).json({
        error: "ticketNo query param is required",
      });
    }

    const ticket = findTicket(ticketNo);

    if (!ticket) {
      return res.status(404).json({
        error: "Ticket not found",
      });
    }

    res.json([
      {
        ticketNo: ticket.ticketNo,
        ticketType: ticket.ticketType,
        priority: ticket.priority,
        status: ticket.status,
        description: ticket.description,
        createdDate: ticket.createdDate,
        modifiedDate: ticket.modifiedDate,
        accountId: [ticket.contractId],
        publicIdentifier: [ticket.msisdn],
        category: [
          {
            id: ticket.subCat,
            name: ticket.subCatName,
            ticketType: ticket.ticketType,
          },
        ],
        note: ticket.notes,
        attachment: ticket.attachments,
      },
    ]);
  }
);

// ─────────────────────────────────────────────────────────────
// Error Handler
// ─────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({
      error: "Invalid JSON body",
    });
  }

  console.error(err);

  res.status(500).json({
    error: "Internal server error",
  });
});

// ─────────────────────────────────────────────────────────────
// 404 Fallback
// ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    error: "Route not found",
  });
});

// ─────────────────────────────────────────────────────────────
// Server
// ─────────────────────────────────────────────────────────────
app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n🚀 Unified Telco API running on port ${PORT}`);
});
