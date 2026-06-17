import http from "node:http";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { URL } from "node:url";
import { fileURLToPath } from "node:url";
import { createPlatformStore } from "./stateStore.js";
import { createLocalBackupPayload } from "../src/platformShared.js";

const PORT = parseInt(process.env.PORT || "8787", 10);
const HOST = process.env.HOST || "0.0.0.0";
const ANTHROPIC_API_KEY = process.env.CARBON_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || "";
const ANTHROPIC_MODEL = process.env.CARBON_ANTHROPIC_MODEL || "claude-sonnet-4-20250514";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const DIST_DIR = path.join(ROOT_DIR, "dist");
const store = await createPlatformStore();

function writeCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET,PUT,POST,OPTIONS");
}

function sendJson(res, statusCode, payload) {
  writeCorsHeaders(res);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload, null, 2));
}

function sendBinary(res, statusCode, buffer, headers = {}) {
  writeCorsHeaders(res);
  res.writeHead(statusCode, {
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(buffer);
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".js") return "application/javascript; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".ico") return "image/x-icon";
  if (ext === ".woff") return "font/woff";
  if (ext === ".woff2") return "font/woff2";
  return "application/octet-stream";
}

async function tryServeStaticAsset(urlPath, res) {
  const requestPath = decodeURIComponent(urlPath.split("?")[0]);
  const relativePath = requestPath === "/" ? "index.html" : requestPath.replace(/^\/+/, "");
  const resolvedPath = path.resolve(DIST_DIR, relativePath);
  if (!resolvedPath.startsWith(DIST_DIR)) return false;
  if (!fs.existsSync(resolvedPath)) return false;
  const stat = await fsp.stat(resolvedPath);
  if (!stat.isFile()) return false;
  const buffer = await fsp.readFile(resolvedPath);
  sendBinary(res, 200, buffer, {
    "Content-Type": contentTypeFor(resolvedPath),
    "Cache-Control": relativePath === "index.html" ? "no-store" : "public, max-age=31536000, immutable",
  });
  return true;
}

async function tryServeSpaShell(res) {
  const indexPath = path.join(DIST_DIR, "index.html");
  if (!fs.existsSync(indexPath)) return false;
  const buffer = await fsp.readFile(indexPath);
  sendBinary(res, 200, buffer, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
  return true;
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function getBearerToken(req) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) return "";
  return header.slice("Bearer ".length).trim();
}

function getUserFromRequest(req) {
  const token = getBearerToken(req);
  const user = store.getUserBySessionToken(token);
  return { token, user };
}

function parseModelJson(text) {
  const cleaned = String(text || "").replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error("Model returned non-JSON extraction output");
  }
}

async function extractPdfWithAnthropic({ base64, mimeType, prompt }) {
  if (!ANTHROPIC_API_KEY) {
    throw new Error("Server AI extraction is not configured. Set CARBON_ANTHROPIC_API_KEY on the backend.");
  }
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 1200,
      messages: [{
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: mimeType || "application/pdf",
              data: base64,
            },
          },
          { type: "text", text: prompt },
        ],
      }],
    }),
  });
  const payload = await response.json();
  if (!response.ok) {
    const detail = payload && payload.error && payload.error.message ? payload.error.message : `Anthropic request failed (${response.status})`;
    throw new Error(detail);
  }
  const text = Array.isArray(payload.content) ? payload.content.map(block => block.text || "").join("") : "";
  return parseModelJson(text);
}

function assertRole(user, roles) {
  store.assertRole(user, roles);
}

setInterval(() => {
  store.processChargeImports().catch(error => {
    console.error("Charge import scan failed:", error);
  });
}, 15000);

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);
    const { token, user } = getUserFromRequest(req);

    if (req.method === "OPTIONS") {
      writeCorsHeaders(res);
      res.writeHead(204);
      return res.end();
    }

    if (url.pathname === "/api/health" && req.method === "GET") {
      return sendJson(res, 200, {
        ok: true,
        service: "carbon-platform-api",
        now: new Date().toISOString(),
        authRequired: true,
      });
    }

    if (url.pathname === "/api/auth/login" && req.method === "POST") {
      const body = await readJsonBody(req);
      const auth = await store.authenticate(body.username, body.password);
      return sendJson(res, 200, auth);
    }

    if (url.pathname === "/api/auth/logout" && req.method === "POST") {
      if (!user) return sendJson(res, 401, { error: "Authentication required" });
      await store.logout(token, user);
      return sendJson(res, 200, { ok: true });
    }

    if (url.pathname === "/api/auth/session" && req.method === "GET") {
      if (!user) return sendJson(res, 401, { error: "Authentication required" });
      return sendJson(res, 200, {
        user,
        adminStatus: store.getAdminStatus(),
      });
    }

    if (url.pathname === "/api/auth/change-password" && req.method === "POST") {
      if (!user) return sendJson(res, 401, { error: "Authentication required" });
      const body = await readJsonBody(req);
      const updated = await store.changePassword(user, body);
      return sendJson(res, 200, { user: updated });
    }

    if (url.pathname === "/api/users" && req.method === "GET") {
      assertRole(user, ["admin"]);
      return sendJson(res, 200, { users: store.listUsers(), adminStatus: store.getAdminStatus() });
    }

    if (url.pathname === "/api/users" && req.method === "POST") {
      assertRole(user, ["admin"]);
      const body = await readJsonBody(req);
      const created = await store.createUser(user, body);
      return sendJson(res, 200, { user: created });
    }

    if (url.pathname === "/api/audit" && req.method === "GET") {
      assertRole(user, ["admin"]);
      const limit = parseInt(url.searchParams.get("limit") || "200", 10);
      return sendJson(res, 200, { audit: store.listAudit(limit) });
    }

    if (url.pathname === "/api/documents" && req.method === "GET") {
      assertRole(user, ["admin", "operator", "viewer"]);
      return sendJson(res, 200, { documents: store.listDocuments() });
    }

    if (url.pathname === "/api/documents" && req.method === "POST") {
      assertRole(user, ["admin", "operator"]);
      const body = await readJsonBody(req);
      const document = await store.saveDocument(user, body);
      return sendJson(res, 200, { document });
    }

    if (url.pathname.startsWith("/api/documents/") && url.pathname.endsWith("/download") && req.method === "GET") {
      assertRole(user, ["admin", "operator", "viewer"]);
      const documentId = decodeURIComponent(url.pathname.split("/")[3] || "");
      const document = store.getDocument(documentId);
      if (!document) return sendJson(res, 404, { error: "Document not found" });
      const buffer = await fsp.readFile(document.fullPath);
      return sendBinary(res, 200, buffer, {
        "Content-Type": document.mimeType,
        "Content-Disposition": `attachment; filename="${document.fileName}"`,
      });
    }

    if (url.pathname === "/api/state" && req.method === "GET") {
      assertRole(user, ["admin", "operator", "viewer"]);
      return sendJson(res, 200, store.getPublicState());
    }

    if (url.pathname === "/api/status" && req.method === "GET") {
      assertRole(user, ["admin", "operator", "viewer"]);
      const state = store.getPublicState();
      return sendJson(res, 200, {
        version: state.version,
        updatedAt: state.updatedAt,
        imports: state.imports,
        storage: state.storage,
        adminStatus: store.getAdminStatus(),
        aiExtractionConfigured: !!ANTHROPIC_API_KEY,
      });
    }

    if (url.pathname.startsWith("/api/state/") && req.method === "PUT") {
      assertRole(user, ["admin", "operator"]);
      const key = decodeURIComponent(url.pathname.slice("/api/state/".length));
      const body = await readJsonBody(req);
      const next = await store.updateKey(key, body.value, user, "api");
      return sendJson(res, 200, next);
    }

    if (url.pathname === "/api/backup/export" && req.method === "GET") {
      assertRole(user, ["admin", "operator"]);
      const state = store.getPublicState();
      const backup = createLocalBackupPayload(state.state, "v1.8.0-platform", new Date().toISOString().slice(0, 10));
      return sendJson(res, 200, backup);
    }

    if (url.pathname === "/api/backup/import" && req.method === "POST") {
      assertRole(user, ["admin"]);
      const body = await readJsonBody(req);
      const next = await store.replaceFromBackup(body, user, "backup-import");
      return sendJson(res, 200, next);
    }

    if (url.pathname === "/api/reset" && req.method === "POST") {
      assertRole(user, ["admin"]);
      const next = await store.reset(user, "api-reset");
      return sendJson(res, 200, next);
    }

    if (url.pathname === "/api/imports/charges/run" && req.method === "POST") {
      assertRole(user, ["admin", "operator"]);
      const next = await store.processChargeImports(user);
      return sendJson(res, 200, next);
    }

    if (url.pathname === "/api/extract/stack-test" && req.method === "POST") {
      assertRole(user, ["admin", "operator"]);
      const body = await readJsonBody(req);
      const extracted = await extractPdfWithAnthropic({
        base64: body.base64,
        mimeType: body.mimeType || "application/pdf",
        prompt: 'Extract data from this Envirocare MCERTS stack test report for a creosote timber treatment plant. Return ONLY JSON with no markdown fences: {"period":"P[n] or empty string","date":"YYYY-MM-DD or empty string","activeHrs":number_or_null,"avgTemp":number_or_null,"stackTemp":number_or_null,"avgRH":number_or_null,"voc":number_or_null,"pah":number_or_null,"charges":number_or_null,"p1Charges":number_or_null,"p2Charges":number_or_null,"flowRate_m3hr":number_or_null}. VOC is TVOC in mg/m3. PAH is total PAH in ug/m3. flowRate is stack discharge flow in m3/hr.',
      });
      if (!extracted.period && body.nextPeriod) extracted.period = body.nextPeriod;
      return sendJson(res, 200, { extracted });
    }

    if (url.pathname === "/api/extract/coa" && req.method === "POST") {
      assertRole(user, ["admin", "operator"]);
      const body = await readJsonBody(req);
      const extracted = await extractPdfWithAnthropic({
        base64: body.base64,
        mimeType: body.mimeType || "application/pdf",
        prompt: 'Extract from this Koppers creosote CoA. Return ONLY JSON with no markdown fences: {"date":"YYYY-MM-DD or empty string","certNo":"string","flashpoint":number_or_null,"crystallisation":number_or_null,"naphthalene":number_or_null,"bap":number_or_null}.',
      });
      return sendJson(res, 200, { extracted });
    }

    if (!url.pathname.startsWith("/api") && req.method === "GET") {
      if (await tryServeStaticAsset(url.pathname, res)) return;
      if (await tryServeSpaShell(res)) return;
      return sendBinary(res, 503, Buffer.from("Frontend build not found. Run npm run build before starting production server.\n"), {
        "Content-Type": "text/plain; charset=utf-8",
      });
    }

    return sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    const message = error && error.message ? error.message : "Unexpected server error";
    const status = /Authentication required/i.test(message) ? 401 : /Permission denied/i.test(message) ? 403 : 500;
    console.error(error);
    return sendJson(res, status, { error: message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Carbon platform server listening on http://${HOST}:${PORT}`);
});
