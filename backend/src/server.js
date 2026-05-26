require("dotenv").config();

const cors = require("cors");
const express = require("express");
const { Pool } = require("pg");

const app = express();
const port = Number(process.env.BACKEND_PORT || 3000);
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 8,
  idleTimeoutMillis: 30000,
});

const notifications = [];

app.use(cors({ origin: true }));
app.use(express.json({ limit: "1mb" }));

function normalizeTags(tags) {
  if (Array.isArray(tags)) return tags.map(String).filter(Boolean);
  if (typeof tags === "string") {
    return tags
      .split(/[\s,]+/)
      .map((tag) => tag.trim())
      .filter(Boolean)
      .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`));
  }
  return [];
}

function validateTrip(input, partial = false) {
  const requiredFields = ["title", "location", "trip_date", "status", "latitude", "longitude"];

  if (!partial) {
    for (const field of requiredFields) {
      if (input[field] === undefined || input[field] === null || input[field] === "") {
        return { error: `${field} is required` };
      }
    }
  }

  const payload = { ...input };

  if (payload.status && !["past", "future"].includes(payload.status)) {
    return { error: "status must be past or future" };
  }

  if (payload.latitude !== undefined) {
    payload.latitude = Number(payload.latitude);
    if (!Number.isFinite(payload.latitude) || payload.latitude < -90 || payload.latitude > 90) {
      return { error: "latitude must be between -90 and 90" };
    }
  }

  if (payload.longitude !== undefined) {
    payload.longitude = Number(payload.longitude);
    if (!Number.isFinite(payload.longitude) || payload.longitude < -180 || payload.longitude > 180) {
      return { error: "longitude must be between -180 and 180" };
    }
  }

  if (payload.trip_date && Number.isNaN(new Date(payload.trip_date).getTime())) {
    return { error: "trip_date must be a valid date" };
  }

  payload.tags = normalizeTags(payload.tags);
  payload.diary = payload.diary || "";
  payload.photo_url = payload.photo_url || "";

  return { payload };
}

async function waitForDatabase(retries = 30) {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await pool.query("SELECT 1");
      return;
    } catch (error) {
      console.log(`Waiting for database (${attempt}/${retries})...`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw new Error("Database did not become available in time");
}

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS trips (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      location TEXT NOT NULL,
      trip_date DATE NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('past', 'future')),
      latitude NUMERIC(10, 6) NOT NULL,
      longitude NUMERIC(10, 6) NOT NULL,
      diary TEXT DEFAULT '',
      tags TEXT[] DEFAULT '{}',
      photo_url TEXT DEFAULT '',
      last_notified_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function seedTrips() {
  const { rows } = await pool.query("SELECT COUNT(*)::int AS count FROM trips");
  if (rows[0].count > 0) return;

  const seedData = [
    {
      title: "London Archive Walk",
      location: "London, United Kingdom",
      trip_date: "2024-12-18",
      status: "past",
      latitude: 51.5072,
      longitude: -0.1276,
      diary: "A quiet winter route from Covent Garden to the Thames, filed as a soft silver memory.",
      tags: ["#museum", "#rain", "#non-smoking"],
      photo_url: "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad",
    },
    {
      title: "Reykjavik Blue Hour",
      location: "Reykjavik, Iceland",
      trip_date: "2025-03-07",
      status: "past",
      latitude: 64.1466,
      longitude: -21.9426,
      diary: "Geothermal steam, basalt edges, and a sky that looked designed for slow breathing.",
      tags: ["#aurora", "#quiet-room", "#window-seat"],
      photo_url: "https://images.unsplash.com/photo-1504829857797-ddff29c27927",
    },
    {
      title: "Da Nang Future Stay",
      location: "Da Nang, Vietnam",
      trip_date: "2026-11-10",
      status: "future",
      latitude: 16.0544,
      longitude: 108.2022,
      diary: "Reserve a sea-facing morning, check non-smoking room preference, and keep one evening open.",
      tags: ["#non-smoking", "#not-corner-room", "#sea-view"],
      photo_url: "https://images.unsplash.com/photo-1559592413-7cec4d0cae2b",
    },
  ];

  for (const trip of seedData) {
    await pool.query(
      `INSERT INTO trips (title, location, trip_date, status, latitude, longitude, diary, tags, photo_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [trip.title, trip.location, trip.trip_date, trip.status, trip.latitude, trip.longitude, trip.diary, trip.tags, trip.photo_url]
    );
  }
}

async function scanFutureTrips() {
  const { rows } = await pool.query(`
    SELECT id, title, location, trip_date
    FROM trips
    WHERE status = 'future'
      AND trip_date = CURRENT_DATE
      AND last_notified_at IS NULL
    ORDER BY trip_date ASC
  `);

  for (const trip of rows) {
    const notification = {
      id: trip.id,
      title: "Travel OS reminder",
      body: `${trip.title} in ${trip.location} starts today.`,
      created_at: new Date().toISOString(),
    };
    notifications.unshift(notification);
    await pool.query("UPDATE trips SET last_notified_at = NOW() WHERE id = $1", [trip.id]);
    console.log(notification.body);
  }
}

app.get("/api/health", async (request, response) => {
  const db = await pool.query("SELECT NOW() AS now");
  response.json({ status: "ok", database_time: db.rows[0].now });
});

app.get("/api/trips", async (request, response) => {
  const { rows } = await pool.query("SELECT * FROM trips ORDER BY trip_date ASC, id ASC");
  response.json(rows);
});

app.get("/api/trips/:id", async (request, response) => {
  const { rows } = await pool.query("SELECT * FROM trips WHERE id = $1", [request.params.id]);
  if (rows.length === 0) return response.status(404).json({ error: "Trip not found" });
  return response.json(rows[0]);
});

app.post("/api/trips", async (request, response) => {
  const validation = validateTrip(request.body);
  if (validation.error) return response.status(400).json({ error: validation.error });

  const trip = validation.payload;
  const { rows } = await pool.query(
    `INSERT INTO trips (title, location, trip_date, status, latitude, longitude, diary, tags, photo_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [trip.title, trip.location, trip.trip_date, trip.status, trip.latitude, trip.longitude, trip.diary, trip.tags, trip.photo_url]
  );

  return response.status(201).json(rows[0]);
});

app.put("/api/trips/:id", async (request, response) => {
  const validation = validateTrip(request.body);
  if (validation.error) return response.status(400).json({ error: validation.error });

  const trip = validation.payload;
  const { rows } = await pool.query(
    `UPDATE trips
     SET title = $1,
         location = $2,
         trip_date = $3,
         status = $4,
         latitude = $5,
         longitude = $6,
         diary = $7,
         tags = $8,
         photo_url = $9,
         last_notified_at = CASE WHEN $4 = 'future' THEN last_notified_at ELSE NULL END,
         updated_at = NOW()
     WHERE id = $10
     RETURNING *`,
    [trip.title, trip.location, trip.trip_date, trip.status, trip.latitude, trip.longitude, trip.diary, trip.tags, trip.photo_url, request.params.id]
  );

  if (rows.length === 0) return response.status(404).json({ error: "Trip not found" });
  return response.json(rows[0]);
});

app.delete("/api/trips/:id", async (request, response) => {
  const { rowCount } = await pool.query("DELETE FROM trips WHERE id = $1", [request.params.id]);
  if (rowCount === 0) return response.status(404).json({ error: "Trip not found" });
  return response.status(204).send();
});

app.get("/api/notifications", (request, response) => {
  response.json(notifications.slice(0, 20));
});

app.use((error, request, response, next) => {
  console.error(error);
  response.status(500).json({ error: "Internal server error" });
});

async function start() {
  await waitForDatabase();
  await ensureSchema();
  await seedTrips();
  await scanFutureTrips();
  setInterval(scanFutureTrips, 60 * 60 * 1000);

  app.listen(port, () => {
    console.log(`Travel OS backend listening on port ${port}`);
  });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
