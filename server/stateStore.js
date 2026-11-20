import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { createDefaultPlatformState, PERSISTED_STATE_KEYS } from "../src/platformShared.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const DATA_ROOT = process.env.CARBON_PLATFORM_DATA_DIR || path.join(ROOT_DIR, "work", "platform-data");
const STATE_PATH = path.join(DATA_ROOT, "live-state.json");
const DB_PATH = path.join(DATA_ROOT, "platform.sqlite");
const SNAPSHOT_DIR = path.join(DATA_ROOT, "snapshots");
const IMPORT_ROOT = path.join(DATA_ROOT, "imports");
const CHARGE_INBOX_DIR = process.env.CARBON_CHARGE_IMPORT_DIR || path.join(IMPORT_ROOT, "charges");
const CHARGE_ARCHIVE_DIR = path.join(IMPORT_ROOT, "charges-processed");
const DOCUMENT_ROOT = path.join(DATA_ROOT, "documents");

const DEFAULT_ADMIN_USERNAME = process.env.CARBON_PLATFORM_ADMIN_USER || "admin";
const DEFAULT_ADMIN_PASSWORD = process.env.CARBON_PLATFORM_ADMIN_PASSWORD || "ChangeMe123!";
const SESSION_TTL_HOURS = Math.max(1, parseInt(process.env.CARBON_PLATFORM_SESSION_HOURS || "12", 10));
const MAX_AUDIT_EVENTS = 2000;
const MAX_DOCUMENTS = 1000;
const MAX_PROCESSED_IMPORTS = 200;
const MAX_SNAPSHOTS = Math.max(20, parseInt(process.env.CARBON_PLATFORM_MAX_SNAPSHOTS || "200", 10));

function isDiskFullError(error) {
  if (!error) return false;
  return error.code === "ERR_SQLITE_ERROR" &&
    (error.errcode === 13 || String(error.errstr || "").toLowerCase().includes("disk is full"));
}

function pbkdf2Hash(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex");
}

function createPasswordRecord(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  return {
    salt,
    hash: pbkdf2Hash(password, salt),
    createdAt: new Date().toISOString(),
  };
}

function verifyPassword(password, record) {
  if (!record || !record.salt || !record.hash) return false;
  const actual = pbkdf2Hash(password, record.salt);
  return crypto.timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(record.hash, "hex"));
}

function safeFileName(name) {
  return String(name || "file.bin").replace(/[^a-zA-Z0-9._-]/g, "_");
}

function withStateDefaults(rawState) {
  const defaults = createDefaultPlatformState();
  const state = rawState && typeof rawState === "object" ? rawState : {};
  return { ...defaults, ...state, cgb_settings: { ...defaults.cgb_settings, ...(state.cgb_settings || {}) } };
}

function normalizeChargeType(type) {
  const raw = String(type || "").toLowerCase();
  if (["plant1", "p1", "fencing", "fence"].includes(raw)) return "plant1";
  if (["plant2", "p2", "poles", "pole"].includes(raw)) return "plant2";
  if (raw === "1") return "plant1";
  if (raw === "2") return "plant2";
  return "";
}

function sanitizeUser(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt || null,
    mustChangePassword: !!user.mustChangePassword,
    active: user.active !== false,
  };
}

function parseChargeCsvText(text, importTag) {
  const rows = String(text || "").split(/\r?\n/).filter(line => line.trim() !== "");
  if (rows.length < 2) return { ready: [], errors: ["CSV has no data rows."] };
  const headers = rows[0].split(",").map(h => h.trim().toLowerCase());
  const idx = name => headers.indexOf(name.toLowerCase());
  const dateIdx = idx("date");
  const typeIdx = idx("type");
  const countIdx = idx("count");
  const durIdx = idx("durationhrs");
  const notesIdx = idx("notes");
  const ready = [];
  const errors = [];
  rows.slice(1).forEach((line, lineNo) => {
    const cols = line.split(",").map(c => c.trim());
    const rawDate = cols[dateIdx] || "";
    const date = rawDate.includes("/") ? rawDate.split("/").map(p => p.padStart(2, "0")).reverse().join("-") : rawDate;
    const type = normalizeChargeType(cols[typeIdx] || "");
    const count = parseInt(cols[countIdx], 10) || 1;
    const durationRaw = durIdx < 0 ? "" : cols[durIdx];
    const durationHrs = durationRaw === "" ? null : parseFloat(durationRaw);
    if (!date || !type) {
      errors.push(`Line ${lineNo + 2}: missing/invalid date or type`);
      return;
    }
    if (durationHrs != null && durationHrs < 0) {
      errors.push(`Line ${lineNo + 2}: negative duration skipped`);
      return;
    }
    ready.push({
      id: `${importTag}-${lineNo + 1}`,
      date,
      type,
      count,
      durationHrs: Number.isFinite(durationHrs) ? durationHrs : null,
      notes: notesIdx >= 0 ? cols[notesIdx] || "" : "",
      source: "server-import",
      importTag,
    });
  });
  return { ready, errors };
}


// ---- Creosote Tank and Flash Point Log sync helpers ----
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
function isoDate(value) {
  const text = String(value == null ? "" : value).trim();
  return ISO_DATE.test(text) ? text : "";
}
function num(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(/[<>,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}
function str(value, max = 200) {
  return value === null || value === undefined ? "" : String(value).trim().slice(0, max);
}
function normalizeCreoDelivery(raw) {
  const date = isoDate(raw && raw.date);
  if (!date) return null;
  return {
    date,
    intoTankDate: isoDate(raw.intoTankDate) || "",
    stockDate: isoDate(raw.stockDate) || date,
    status: str(raw.status, 40),
    supplier: str(raw.supplier, 60),
    type: str(raw.type, 20),
    qtyKg: num(raw.qtyKg),
    certNo: str(raw.certNo, 40),
    flashpoint: num(raw.flashpoint),
    crystallisation: num(raw.crystallisation),
    tarAcid: num(raw.tarAcid),
    tolueneInsol: num(raw.tolueneInsol),
    naphthalene: num(raw.naphthalene),
    bap: num(raw.bap),
    water: num(raw.water),
    density: num(raw.density),
    dist235: num(raw.dist235),
    dist300: num(raw.dist300),
    dist355: num(raw.dist355),
    orderNo: str(raw.orderNo, 40),
    transport: str(raw.transport, 60),
    outOfSpec: str(raw.outOfSpec, 200),
  };
}
function normalizeCreoReading(raw) {
  const date = isoDate(raw && raw.date);
  if (!date) return null;
  return {
    date,
    store1Kg: num(raw.store1Kg),
    store2Kg: num(raw.store2Kg),
    work1Kg: num(raw.work1Kg),
    work2Kg: num(raw.work2Kg),
    totalKg: num(raw.totalKg),
    correctedKg: num(raw.correctedKg),
    deliveredKg: num(raw.deliveredKg),
    usageKg: num(raw.usageKg),
    workingDays: num(raw.workingDays),
    usagePerDayKg: num(raw.usagePerDayKg),
    ambientC: num(raw.ambientC),
    idleDays: num(raw.idleDays),
  };
}

function defaultEnvelope() {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    state: createDefaultPlatformState(),
    imports: {
      charges: {
        processed: [],
        lastRunAt: null,
        lastImportedAt: null,
        lastFile: null,
        lastSummary: "No automated charge imports yet.",
        lastError: "",
      },
      creosote: {
        lastRunAt: null,
        lastImportedAt: null,
        lastFile: null,
        lastFileModifiedAt: null,
        lastSummary: "No creosote log syncs yet.",
        lastError: "",
      },
    },
    security: {
      users: [],
      sessions: [],
    },
    documents: [],
    audit: [],
  };
}

function sanitizeEnvelope(rawEnvelope) {
  const base = defaultEnvelope();
  const envelope = rawEnvelope && typeof rawEnvelope === "object" ? rawEnvelope : {};
  return {
    version: Number.isFinite(envelope.version) ? envelope.version : base.version,
    updatedAt: envelope.updatedAt || base.updatedAt,
    state: withStateDefaults(envelope.state),
    imports: {
      charges: {
        ...base.imports.charges,
        ...(envelope.imports && envelope.imports.charges ? envelope.imports.charges : {}),
      },
      creosote: {
        ...base.imports.creosote,
        ...(envelope.imports && envelope.imports.creosote ? envelope.imports.creosote : {}),
      },
    },
    security: {
      users: Array.isArray(envelope.security && envelope.security.users) ? envelope.security.users : [],
      sessions: Array.isArray(envelope.security && envelope.security.sessions) ? envelope.security.sessions : [],
    },
    documents: Array.isArray(envelope.documents) ? envelope.documents : [],
    audit: Array.isArray(envelope.audit) ? envelope.audit : [],
  };
}

export class PlatformStateStore {
  constructor() {
    this.envelope = defaultEnvelope();
    this.writeQueue = Promise.resolve();
    this.db = null;
  }

  async init() {
    await fsp.mkdir(DATA_ROOT, { recursive: true });
    await fsp.mkdir(SNAPSHOT_DIR, { recursive: true });
    await fsp.mkdir(CHARGE_INBOX_DIR, { recursive: true });
    await fsp.mkdir(CHARGE_ARCHIVE_DIR, { recursive: true });
    await fsp.mkdir(DOCUMENT_ROOT, { recursive: true });
    await this.pruneSnapshots();
    this.db = new DatabaseSync(DB_PATH);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS platform_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    const row = this.db.prepare("SELECT value FROM platform_meta WHERE key = ?").get("envelope");
    if (row && row.value) {
      this.envelope = sanitizeEnvelope(JSON.parse(row.value));
    } else if (fs.existsSync(STATE_PATH)) {
      const raw = JSON.parse(await fsp.readFile(STATE_PATH, "utf8"));
      this.envelope = sanitizeEnvelope(raw);
      await this.saveEnvelopeToDatabase("migrated-from-json");
      await this.writeSnapshot("migrated-from-json");
    } else {
      await this.saveEnvelopeToDatabase("bootstrap");
      await this.writeSnapshot("bootstrap");
    }
    await this.ensureBootstrapAdmin();
    await this.cleanupExpiredSessions();
    await this.processChargeImports();
    return this.envelope;
  }

  async saveEnvelopeToDatabase(source) {
    if (!this.db) throw new Error("Database is not initialised");
    this.envelope.updatedAt = new Date().toISOString();
    try {
      this.db.prepare(`
        INSERT INTO platform_meta (key, value)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `).run("envelope", JSON.stringify(this.envelope));
      this.db.prepare(`
        INSERT INTO platform_meta (key, value)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `).run("lastWriteSource", String(source || "unknown"));
    } catch (error) {
      if (!isDiskFullError(error)) throw error;
      await this.pruneSnapshots();
      this.db.exec("PRAGMA wal_checkpoint(FULL);");
      this.db.prepare(`
        INSERT INTO platform_meta (key, value)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `).run("envelope", JSON.stringify(this.envelope));
      this.db.prepare(`
        INSERT INTO platform_meta (key, value)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `).run("lastWriteSource", String(source || "unknown"));
    }
  }

  getPublicState() {
    return {
      version: this.envelope.version,
      updatedAt: this.envelope.updatedAt,
      state: withStateDefaults(this.envelope.state),
      imports: this.envelope.imports,
      storage: {
        dataRoot: DATA_ROOT,
        databasePath: DB_PATH,
        chargeInboxDir: CHARGE_INBOX_DIR,
        snapshotDir: SNAPSHOT_DIR,
        documentRoot: DOCUMENT_ROOT,
        legacyStateJsonPath: STATE_PATH,
      },
    };
  }

  getAdminStatus() {
    const hasOnlyBootstrapUser = this.envelope.security.users.length === 1 && this.envelope.security.users[0].username === DEFAULT_ADMIN_USERNAME;
    return {
      bootstrapAdminUsername: DEFAULT_ADMIN_USERNAME,
      usingDefaultAdminPassword: hasOnlyBootstrapUser && verifyPassword(DEFAULT_ADMIN_PASSWORD, this.envelope.security.users[0].password),
      sessionHours: SESSION_TTL_HOURS,
    };
  }

  async ensureBootstrapAdmin() {
    if ((this.envelope.security.users || []).length > 0) return;
    const now = new Date().toISOString();
    this.envelope.security.users = [{
      id: crypto.randomUUID(),
      username: DEFAULT_ADMIN_USERNAME,
      displayName: "Platform Administrator",
      role: "admin",
      active: true,
      mustChangePassword: DEFAULT_ADMIN_PASSWORD === "ChangeMe123!",
      createdAt: now,
      lastLoginAt: null,
      password: createPasswordRecord(DEFAULT_ADMIN_PASSWORD),
    }];
    this.addAudit("bootstrap-admin-created", null, {
      username: DEFAULT_ADMIN_USERNAME,
      usedDefaultPassword: DEFAULT_ADMIN_PASSWORD === "ChangeMe123!",
    });
    await this.flush("bootstrap-admin");
  }

  async cleanupExpiredSessions() {
    const now = Date.now();
    const before = this.envelope.security.sessions.length;
    this.envelope.security.sessions = this.envelope.security.sessions.filter(session => new Date(session.expiresAt).getTime() > now);
    if (this.envelope.security.sessions.length !== before) {
      await this.flush("session-cleanup");
    }
  }

  addAudit(action, actor, detail) {
    this.envelope.audit = [{
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      action,
      actor: actor ? { id: actor.id, username: actor.username, role: actor.role } : null,
      detail: detail || {},
    }, ...this.envelope.audit].slice(0, MAX_AUDIT_EVENTS);
  }

  listAudit(limit = 200) {
    return this.envelope.audit.slice(0, Math.max(1, Math.min(limit, MAX_AUDIT_EVENTS)));
  }

  listUsers() {
    return this.envelope.security.users.map(sanitizeUser);
  }

  listDocuments() {
    return this.envelope.documents.slice().sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  }

  getDocument(documentId) {
    return this.envelope.documents.find(doc => doc.id === documentId) || null;
  }

  getUserBySessionToken(token) {
    if (!token) return null;
    const now = Date.now();
    const digest = crypto.createHash("sha256").update(token).digest("hex");
    const session = this.envelope.security.sessions.find(item => item.tokenHash === digest && new Date(item.expiresAt).getTime() > now);
    if (!session) return null;
    const user = this.envelope.security.users.find(item => item.id === session.userId && item.active !== false);
    return user ? sanitizeUser(user) : null;
  }

  assertRole(user, allowedRoles) {
    if (!user) throw new Error("Authentication required");
    if (!allowedRoles.includes(user.role)) {
      throw new Error("Permission denied");
    }
  }

  async authenticate(username, password) {
    await this.cleanupExpiredSessions();
    const candidate = this.envelope.security.users.find(user => user.username.toLowerCase() === String(username || "").toLowerCase() && user.active !== false);
    if (!candidate || !verifyPassword(String(password || ""), candidate.password)) {
      this.addAudit("login-failed", null, { username: String(username || "") });
      await this.flush("login-failed");
      throw new Error("Invalid username or password");
    }
    candidate.lastLoginAt = new Date().toISOString();
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 3600000).toISOString();
    this.envelope.security.sessions = [{
      id: crypto.randomUUID(),
      userId: candidate.id,
      tokenHash: crypto.createHash("sha256").update(token).digest("hex"),
      createdAt: new Date().toISOString(),
      expiresAt,
    }, ...this.envelope.security.sessions].slice(0, 200);
    this.addAudit("login-success", sanitizeUser(candidate), { expiresAt });
    await this.flush("login-success");
    return {
      token,
      expiresAt,
      user: sanitizeUser(candidate),
      adminStatus: this.getAdminStatus(),
    };
  }

  async logout(token, user) {
    const digest = crypto.createHash("sha256").update(token).digest("hex");
    const before = this.envelope.security.sessions.length;
    this.envelope.security.sessions = this.envelope.security.sessions.filter(session => session.tokenHash !== digest);
    this.addAudit("logout", user || null, { removed: before !== this.envelope.security.sessions.length });
    await this.flush("logout");
  }

  async createUser(actor, { username, displayName, password, role }) {
    this.assertRole(actor, ["admin"]);
    const normalizedUsername = String(username || "").trim().toLowerCase();
    if (!normalizedUsername) throw new Error("Username is required");
    if (!["admin", "operator", "viewer"].includes(role)) throw new Error("Role must be admin, operator, or viewer");
    if ((this.envelope.security.users || []).some(user => user.username.toLowerCase() === normalizedUsername)) {
      throw new Error("Username already exists");
    }
    if (!password || String(password).length < 10) {
      throw new Error("Password must be at least 10 characters");
    }
    const user = {
      id: crypto.randomUUID(),
      username: normalizedUsername,
      displayName: String(displayName || normalizedUsername),
      role,
      active: true,
      mustChangePassword: true,
      createdAt: new Date().toISOString(),
      lastLoginAt: null,
      password: createPasswordRecord(String(password)),
    };
    this.envelope.security.users.push(user);
    this.addAudit("user-created", actor, { username: user.username, role: user.role });
    await this.flush("user-created");
    return sanitizeUser(user);
  }

  async changePassword(actor, { currentPassword, newPassword, targetUserId }) {
    if (!actor) throw new Error("Authentication required");
    const targetId = targetUserId || actor.id;
    const target = this.envelope.security.users.find(user => user.id === targetId && user.active !== false);
    if (!target) throw new Error("User not found");
    const actorFull = this.envelope.security.users.find(user => user.id === actor.id);
    const isSelf = actor.id === targetId;
    if (!isSelf && actor.role !== "admin") {
      throw new Error("Permission denied");
    }
    if (isSelf && !verifyPassword(String(currentPassword || ""), target.password)) {
      throw new Error("Current password is incorrect");
    }
    if (!newPassword || String(newPassword).length < 10) {
      throw new Error("New password must be at least 10 characters");
    }
    target.password = createPasswordRecord(String(newPassword));
    target.mustChangePassword = false;
    this.addAudit("password-changed", sanitizeUser(actorFull), { targetUserId: target.id, self: isSelf });
    await this.flush("password-changed");
    return sanitizeUser(target);
  }

  async saveDocument(actor, { category, fileName, mimeType, base64, relatedId, notes }) {
    this.assertRole(actor, ["admin", "operator"]);
    const safeCategory = safeFileName(category || "general");
    const safeName = safeFileName(fileName || "document.bin");
    const bytes = Buffer.from(String(base64 || ""), "base64");
    if (bytes.length === 0) throw new Error("Document payload is empty");
    if (bytes.length > 15 * 1024 * 1024) throw new Error("Document exceeds 15 MB limit");
    const docDir = path.join(DOCUMENT_ROOT, safeCategory);
    await fsp.mkdir(docDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const storedName = `${stamp}-${safeName}`;
    const fullPath = path.join(docDir, storedName);
    await fsp.writeFile(fullPath, bytes);
    const record = {
      id: crypto.randomUUID(),
      category: safeCategory,
      fileName: safeName,
      storedName,
      mimeType: mimeType || "application/octet-stream",
      sizeBytes: bytes.length,
      uploadedAt: new Date().toISOString(),
      uploadedBy: { id: actor.id, username: actor.username, role: actor.role },
      relatedId: relatedId || null,
      notes: notes || "",
      fullPath,
    };
    this.envelope.documents = [record, ...this.envelope.documents].slice(0, MAX_DOCUMENTS);
    this.addAudit("document-uploaded", actor, { category: safeCategory, fileName: safeName, sizeBytes: bytes.length, relatedId: relatedId || null });
    await this.flush("document-uploaded");
    return record;
  }

  async updateKey(key, value, actor = null, source = "api") {
    if (!PERSISTED_STATE_KEYS.includes(key)) {
      throw new Error(`Unsupported platform key: ${key}`);
    }
    const nextState = { ...this.envelope.state, [key]: value };
    this.addAudit("state-updated", actor, { key, source });
    await this.persist(nextState, source);
    return this.getPublicState();
  }

  async replaceFromBackup(payload, actor = null, source = "backup-import") {
    const nextState = createDefaultPlatformState();
    PERSISTED_STATE_KEYS.forEach(key => {
      if (key in payload) nextState[key] = payload[key];
    });
    nextState.cgb_settings = { ...createDefaultPlatformState().cgb_settings, ...(payload.cgb_settings || {}) };
    this.addAudit("backup-imported", actor, { source });
    await this.persist(nextState, source);
    return this.getPublicState();
  }

  async reset(actor = null, source = "reset") {
    this.addAudit("platform-reset", actor, { source });
    await this.persist(createDefaultPlatformState(), source);
    return this.getPublicState();
  }

  async persist(nextState, source) {
    const previousImports = this.envelope.imports;
    const nextEnvelope = {
      ...this.envelope,
      version: this.envelope.version + 1,
      updatedAt: new Date().toISOString(),
      state: withStateDefaults(nextState),
      imports: previousImports,
      lastWriteSource: source,
    };
    this.envelope = nextEnvelope;
    this.writeQueue = this.writeQueue.then(async () => {
      await this.saveEnvelopeToDatabase(source);
      await this.writeSnapshot(source);
    });
    await this.writeQueue;
  }

  async flush(source) {
    this.writeQueue = this.writeQueue.then(async () => {
      await this.saveEnvelopeToDatabase(source);
      await this.writeSnapshot(source);
    });
    await this.writeQueue;
  }

  async writeSnapshot(source) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const name = `${stamp}-${source}.json`;
    await fsp.writeFile(path.join(SNAPSHOT_DIR, name), JSON.stringify(this.envelope, null, 2));
    await this.pruneSnapshots();
  }

  async pruneSnapshots() {
    const entries = await fsp.readdir(SNAPSHOT_DIR, { withFileTypes: true }).catch(function() {
      return [];
    });
    const files = [];
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const fullPath = path.join(SNAPSHOT_DIR, entry.name);
      const stat = await fsp.stat(fullPath);
      files.push({ fullPath, mtimeMs: stat.mtimeMs });
    }
    files.sort((a, b) => b.mtimeMs - a.mtimeMs);
    const stale = files.slice(MAX_SNAPSHOTS);
    for (const file of stale) {
      await fsp.unlink(file.fullPath);
    }
  }

  async processChargeImports(actor = null) {
    const charges = this.envelope.imports.charges;
    charges.lastRunAt = new Date().toISOString();
    const files = (await fsp.readdir(CHARGE_INBOX_DIR)).filter(name => name.toLowerCase().endsWith(".csv")).sort();
    if (files.length === 0) {
      charges.lastSummary = charges.lastSummary || "No automated charge imports yet.";
      return this.getPublicState();
    }
    let changed = false;
    for (const fileName of files) {
      const filePath = path.join(CHARGE_INBOX_DIR, fileName);
      const content = await fsp.readFile(filePath, "utf8");
      const digest = crypto.createHash("sha256").update(content).digest("hex");
      if ((charges.processed || []).some(entry => entry.digest === digest)) {
        await this.archiveImportedFile(filePath, fileName, "duplicate");
        continue;
      }
      const importTag = `charge-${digest.slice(0, 12)}`;
      const parsed = parseChargeCsvText(content, importTag);
      const readyIds = new Set(this.envelope.state.cgb_chargeLog.map(entry => String(entry.id)));
      const additions = parsed.ready.filter(entry => !readyIds.has(String(entry.id)));
      if (additions.length > 0) {
        this.envelope.state.cgb_chargeLog = [...this.envelope.state.cgb_chargeLog, ...additions];
        changed = true;
      }
      charges.processed = [
        ...(charges.processed || []),
        {
          fileName,
          digest,
          importedAt: new Date().toISOString(),
          recordCount: additions.length,
          errors: parsed.errors,
        },
      ].slice(-MAX_PROCESSED_IMPORTS);
      charges.lastImportedAt = new Date().toISOString();
      charges.lastFile = fileName;
      charges.lastError = parsed.errors.join(" | ");
      charges.lastSummary = `Imported ${additions.length} charge records from ${fileName}.`;
      this.addAudit("charge-import-processed", actor, {
        fileName,
        digest,
        recordCount: additions.length,
        errors: parsed.errors,
      });
      await this.archiveImportedFile(filePath, fileName, "processed");
    }
    if (changed) {
      await this.persist(this.envelope.state, "charge-import");
    } else {
      await this.flush("charge-import-scan");
    }
    return this.getPublicState();
  }

  async importChargeRows(rows, actor = null, source = "mdb-sync") {
    const charges = this.envelope.imports.charges;
    charges.lastRunAt = new Date().toISOString();
    const existing = new Map((this.envelope.state.cgb_chargeLog || []).map(entry => [String(entry.id), entry]));
    const nextLog = [];
    const touched = new Set();
    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const rawRow of Array.isArray(rows) ? rows : []) {
      const sourceId = rawRow && rawRow.id != null ? String(rawRow.id) : "";
      const type = normalizeChargeType(rawRow && rawRow.type != null ? rawRow.type : rawRow && rawRow.plant != null ? rawRow.plant : "");
      const date = String(rawRow && rawRow.date ? rawRow.date : "");
      const durationHrs = rawRow && rawRow.durationHrs != null ? Number(rawRow.durationHrs) : null;
      const count = rawRow && rawRow.count != null ? Math.max(1, parseInt(rawRow.count, 10) || 1) : 1;
      if (!sourceId || !type || !date || !Number.isFinite(durationHrs) || durationHrs <= 0) {
        skipped += 1;
        continue;
      }
      const normalized = {
        id: sourceId,
        date,
        type,
        count,
        durationHrs: Math.round(durationHrs * 100) / 100,
        notes: rawRow && rawRow.notes ? String(rawRow.notes) : "",
        source,
        importTag: rawRow && rawRow.importTag ? String(rawRow.importTag) : source,
      };
      const previous = existing.get(sourceId);
      if (previous) {
        const changed = JSON.stringify(previous) !== JSON.stringify({ ...previous, ...normalized });
        nextLog.push(changed ? { ...previous, ...normalized } : previous);
        updated += changed ? 1 : 0;
      } else {
        nextLog.push(normalized);
        inserted += 1;
      }
      touched.add(sourceId);
    }

    for (const entry of this.envelope.state.cgb_chargeLog || []) {
      if (!touched.has(String(entry.id))) nextLog.push(entry);
    }

    nextLog.sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")) || String(a.id).localeCompare(String(b.id)));
    this.envelope.state.cgb_chargeLog = nextLog;
    charges.lastImportedAt = new Date().toISOString();
    charges.lastFile = source;
    charges.lastError = skipped > 0 ? `Skipped ${skipped} incomplete/invalid charge rows.` : "";
    charges.lastSummary = `MDB sync applied: ${inserted} inserted, ${updated} updated, ${skipped} skipped.`;
    this.addAudit("charge-import-mdb-sync", actor, {
      source,
      inserted,
      updated,
      skipped,
      rowCount: Array.isArray(rows) ? rows.length : 0,
    });
    await this.persist(this.envelope.state, source);
    return this.getPublicState();
  }

  // Creosote Tank and Flash Point Log (SharePoint workbook) -> platform state.
  // The workbook is the site master record, so on each sync:
  //  - deliveries and daily tank readings from payload.sinceDate onward replace what the
  //    platform held for that range (earlier history is kept);
  //  - every delivery with a cert number is upserted into the CoA Data tab by cert number.
  async importCreosoteLog(payload, actor = null, source = "creosote-xlsx-sync") {
    const info = this.envelope.imports.creosote;
    info.lastRunAt = new Date().toISOString();
    const body = payload && typeof payload === "object" ? payload : {};
    const deliveries = (Array.isArray(body.deliveries) ? body.deliveries : []).map(normalizeCreoDelivery).filter(Boolean);
    const readings = (Array.isArray(body.dailyLog) ? body.dailyLog : []).map(normalizeCreoReading).filter(Boolean);
    const rejected = (Array.isArray(body.deliveries) ? body.deliveries.length : 0) - deliveries.length
      + (Array.isArray(body.dailyLog) ? body.dailyLog.length : 0) - readings.length;
    if (deliveries.length === 0 && readings.length === 0) {
      info.lastError = "Sync received no valid deliveries or tank readings.";
      await this.flush("creosote-sync-empty");
      throw new Error(info.lastError);
    }
    const allDates = [...deliveries, ...readings].map(row => row.date).sort();
    const since = isoDate(body.sinceDate) || allDates[0];
    for (let i = deliveries.length - 1; i >= 0; i -= 1) if (deliveries[i].date < since) deliveries.splice(i, 1);
    for (let i = readings.length - 1; i >= 0; i -= 1) if (readings[i].date < since) readings.splice(i, 1);

    const state = this.envelope.state;
    const keepDeliveries = (state.cgb_creoDeliveries || []).filter(row => String(row.date || "") < since);
    const nextDeliveries = [...keepDeliveries, ...deliveries.filter(row => row.date >= since)]
      .sort((a, b) => a.date.localeCompare(b.date) || a.certNo.localeCompare(b.certNo));
    const readingMap = new Map();
    readings.filter(row => row.date >= since).forEach(row => readingMap.set(row.date, row));
    const keepReadings = (state.cgb_creoDailyLog || []).filter(row => String(row.date || "") < since);
    const nextReadings = [...keepReadings, ...readingMap.values()].sort((a, b) => a.date.localeCompare(b.date));

    // CoA upsert by cert number
    const coa = Array.isArray(state.cgb_coaData) ? state.cgb_coaData.slice() : [];
    const indexByCert = new Map();
    coa.forEach((row, i) => { if (row && row.certNo) indexByCert.set(String(row.certNo).trim().toUpperCase(), i); });
    let coaInserted = 0;
    let coaUpdated = 0;
    deliveries.filter(row => row.certNo).forEach(row => {
      const record = {
        date: row.date,
        certNo: row.certNo,
        flashpoint: row.flashpoint,
        crystallisation: row.crystallisation,
        naphthalene: row.naphthalene,
        bap: row.bap,
        supplier: row.supplier,
        type: row.type,
        qtyKg: row.qtyKg,
        density: row.density,
        tarAcid: row.tarAcid,
        tolueneInsol: row.tolueneInsol,
        water: row.water,
        dist235: row.dist235,
        dist300: row.dist300,
        dist355: row.dist355,
        status: row.status,
        outOfSpec: row.outOfSpec,
        source: "creosote-log",
      };
      const key = row.certNo.toUpperCase();
      if (indexByCert.has(key)) {
        const i = indexByCert.get(key);
        const merged = { ...coa[i], ...record };
        if (JSON.stringify(merged) !== JSON.stringify(coa[i])) { coa[i] = merged; coaUpdated += 1; }
      } else {
        indexByCert.set(key, coa.length);
        coa.push(record);
        coaInserted += 1;
      }
    });
    coa.sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));

    const lastReading = nextReadings[nextReadings.length - 1];
    info.lastImportedAt = new Date().toISOString();
    info.lastFile = str(body.fileName, 200) || source;
    info.lastFileModifiedAt = str(body.fileModifiedAt, 40) || null;
    info.sinceDate = since;
    info.deliveryCount = nextDeliveries.length;
    info.readingCount = nextReadings.length;
    info.latestReadingDate = lastReading ? lastReading.date : null;
    info.lastError = rejected > 0 ? `Skipped ${rejected} rows without a valid date.` : "";
    info.lastSummary = `Creosote log sync: ${deliveries.length} deliveries and ${readings.length} tank readings from ${since}; CoA ${coaInserted} added, ${coaUpdated} updated.`;
    this.addAudit("creosote-log-sync", actor, {
      source,
      since,
      deliveries: deliveries.length,
      readings: readings.length,
      coaInserted,
      coaUpdated,
      rejected,
    });
    await this.persist({ ...state, cgb_creoDeliveries: nextDeliveries, cgb_creoDailyLog: nextReadings, cgb_coaData: coa }, source);
    return { summary: info.lastSummary, coaInserted, coaUpdated, deliveries: deliveries.length, readings: readings.length, since };
  }

  async archiveImportedFile(filePath, fileName, suffix) {
    const targetName = `${new Date().toISOString().replace(/[:.]/g, "-")}-${suffix}-${fileName}`;
    await fsp.rename(filePath, path.join(CHARGE_ARCHIVE_DIR, targetName));
  }
}

export async function createPlatformStore() {
  const store = new PlatformStateStore();
  await store.init();
  return store;
}
