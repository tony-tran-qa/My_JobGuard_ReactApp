import { useState, useEffect, useRef } from "react";

// ── STORAGE ──────────────────────────────────────────────────────
const STORAGE_KEY    = "jg_blacklist";
const API_KEY_STORE  = "jg_api_key";
const CACHE_KEY      = "jg_cache";
const RECORDS_KEY    = "jg_records";
const FAVS_KEY       = "jg_favs";
const ORGS_KEY       = "jg_orgs";
const ORG_TYPES      = ["Staffing / Recruiter", "IT Consulting"];

const DEFAULT_BLACKLIST = [
  { name: "TechHire Global",      reason: "Known phishing recruiter, requests SSN upfront" },
  { name: "RemoteWork Pro",       reason: "Fake job listings, data harvesting" },
  { name: "QuickHire Solutions",  reason: "Requests payment for training materials" },
  { name: "GlobalTalent Connect", reason: "Identity theft scam" },
  { name: "FastTrack Careers",    reason: "Impersonates real companies, fake interview process" },
];

function loadBL()       { try { const s = localStorage.getItem(STORAGE_KEY);  return s ? JSON.parse(s) : DEFAULT_BLACKLIST; } catch { return DEFAULT_BLACKLIST; } }
function saveBL(l)      { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(l)); } catch { /* storage unavailable: keep going without saving */ } }
function loadKey()      { try { return localStorage.getItem(API_KEY_STORE) || ""; } catch { return ""; } }
function saveKey(k)     { try { localStorage.setItem(API_KEY_STORE, k); } catch { /* storage unavailable: keep going without saving */ } }
function loadRecords()  { try { const s = localStorage.getItem(RECORDS_KEY); return s ? JSON.parse(s) : []; } catch { return []; } }
function loadFavs()     { try { const s = localStorage.getItem(FAVS_KEY);    return s ? JSON.parse(s) : []; } catch { return []; } }
function loadOrgs()     { try { const s = localStorage.getItem(ORGS_KEY);    return s ? JSON.parse(s) : []; } catch { return []; } }
function saveOrgs(o)    { try { localStorage.setItem(ORGS_KEY, JSON.stringify(o)); } catch { /* storage unavailable: keep going without saving */ } }
function saveFavs(f)    { try { localStorage.setItem(FAVS_KEY, JSON.stringify(f)); } catch { /* storage unavailable: keep going without saving */ } }
function saveRecords(r) { try { localStorage.setItem(RECORDS_KEY, JSON.stringify(r)); } catch { /* storage unavailable: keep going without saving */ } }

function getCached(company, role) {
  try {
    const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
    const entry = cache[`${company}::${role}`.toLowerCase()];
    if (entry && Date.now() - entry.ts < 86400000) return { ...entry.result, fromCache: true };
  } catch { /* storage unavailable: keep going without saving */ }
  return null;
}
function setCached(company, role, result) {
  try {
    const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
    cache[`${company}::${role}`.toLowerCase()] = { result, ts: Date.now() };
    const keys = Object.keys(cache);
    if (keys.length > 100) delete cache[keys[0]];
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch { /* storage unavailable: keep going without saving */ }
}

// ── UTILITIES ─────────────────────────────────────────────────────
function extractDomain(url) {
  try {
    const u = new URL(url.startsWith("http") ? url : "https://" + url);
    return u.hostname.replace(/^www\./, "");
  } catch { return ""; }
}

// Company website: the URL the user typed wins, else the AI's own answer.
function siteFor(url, res) {
  return extractDomain(url || "") || extractDomain(res?.website || "");
}

// ── API ───────────────────────────────────────────────────────────
async function vetCompanyWithAI(companyName, role, apiKey, url) {
  const cached = getCached(companyName, role);
  if (cached) return cached;

  if (!apiKey?.trim())           throw { code: "NO_KEY" };
  if (!apiKey.startsWith("sk-")) throw { code: "BAD_KEY_FORMAT" };

  const urlContext = url ? `\nHomepage URL: "${url}"` : "";
  const prompt = `You are a company intelligence and job scam detection expert. Analyze this company${role ? " and role" : ""} thoroughly.

Company: "${companyName}"${role ? `\nRole: "${role}"` : ""}${urlContext}

Reply with ONLY raw JSON (no markdown fences, no extra text):
{
  "riskLevel": "LOW" | "MEDIUM" | "HIGH",
  "recommendation": "APPLY" | "CAUTION" | "AVOID",
  "verdict": "one concise sentence summarizing legitimacy",
  "redFlags": ["up to 3 specific red flags"],
  "greenFlags": ["up to 3 specific green flags"],
  "verificationSteps": ["step1", "step2", "step3"],
  "companyType": "e.g. Software / SaaS, Staffing Agency, Financial Services, Healthcare, Retail, Manufacturing, Consulting, etc.",
  "orgType": "Staffing / Recruiter" | "IT Consulting" | "Other",
  "ownership": "Public" | "Private" | "Non-Profit" | "Government" | "Unknown",
  "headcount": "e.g. 1-10, 11-50, 51-200, 201-500, 501-1000, 1001-5000, 5001-10000, 10000+, or Unknown",
  "annualRevenue": "e.g. <$1M, $1M-$10M, $10M-$50M, $50M-$200M, $200M-$1B, $1B-$10B, $10B+, or Unknown",
  "founded": "year founded or Unknown",
  "headquarters": "City, Country or Unknown",
  "website": "the company's official homepage domain if you know it, e.g. anthropic.com, otherwise Unknown",
  "confidenceNote": "brief note on data confidence, e.g. Well-known public company — data reliable or Limited public info — estimates only"
}

orgType: use "Staffing / Recruiter" for a staffing agency, recruiting or headhunting firm, or contract workforce provider (including IT staffing firms such as Procom or Robert Half). Use "IT Consulting" for an IT consulting, IT services or systems integration firm that is not mainly a staffing firm. Use "Other" for everything else.
For well-known companies (Google, Microsoft, Anthropic, etc.) use accurate known data.
For obscure or likely fake companies, use Unknown for financial fields and note low confidence.
headcount and annualRevenue should be ranges, not exact figures.${url ? `\nIf a Homepage URL is provided, use the domain to help identify and verify the company. A mismatched or suspicious domain (e.g. typosquatting, free hosting) should be flagged as a red flag.` : ""}\nYou have no internet access and cannot search. Base your judgment only on the company name, role, and URL given plus your own training knowledge. Never write that a company is missing from, unregistered in, or unverifiable in any database, registry, directory, search engine, LinkedIn, or Glassdoor. If you do not know a company, say only that you do not recognize it.\nNot recognizing a company is NOT evidence of fraud. If you do not recognize the company and the role and URL show no concrete scam signals, use riskLevel MEDIUM and recommendation CAUTION, and say it is unverified.\nThese are concrete scam signals, and any ONE of them requires riskLevel HIGH and recommendation AVOID, even if the company is unknown: (1) a role that involves receiving, holding, transferring, or processing money, payments, or checks for the employer; (2) receiving and reshipping packages; (3) vague remote data-entry or clerical work offered by a generic, unidentifiable company; (4) mystery shopping; (5) trading or managing cryptocurrency on someone's behalf; (6) impersonating a government agency or a well-known brand, including a lookalike, typosquatted, cheap-TLD, or free-hosting domain.\nIf you list a red flag that matches one of these signals, your recommendation must be AVOID, not CAUTION.`;

  let response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey.trim(),
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 900,
        messages: [{ role: "user", content: prompt }],
      }),
    });
  } catch (e) { throw { code: "NETWORK", detail: e.message }; }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    if (response.status === 401 || response.status === 403) throw { code: "AUTH" };
    if (response.status === 429) throw { code: "RATE_LIMIT" };
    throw { code: "HTTP", status: response.status, detail: body?.error?.message };
  }

  const data  = await response.json();
  const raw   = data.content?.map(b => b.text || "").join("") || "";
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw { code: "NO_JSON", raw };

  let result;
  try { result = JSON.parse(match[0]); }
  catch { throw { code: "PARSE", raw }; }

  // Safe defaults
  if (!["LOW","MEDIUM","HIGH"].includes(result.riskLevel))          result.riskLevel       = "MEDIUM";
  if (!["APPLY","CAUTION","AVOID"].includes(result.recommendation)) result.recommendation  = "CAUTION";
  if (!["Public","Private","Non-Profit","Government","Unknown"].includes(result.ownership)) result.ownership = "Unknown";
  result.redFlags          = Array.isArray(result.redFlags)          ? result.redFlags          : [];
  result.greenFlags        = Array.isArray(result.greenFlags)        ? result.greenFlags        : [];
  result.verificationSteps = Array.isArray(result.verificationSteps) ? result.verificationSteps : [];
  result.companyType       = result.companyType    || "Unknown";
  result.headcount         = result.headcount      || "Unknown";
  result.annualRevenue     = result.annualRevenue  || "Unknown";
  result.founded           = result.founded        || "Unknown";
  result.headquarters      = result.headquarters   || "Unknown";
  result.website           = result.website        || "Unknown";
  result.confidenceNote    = result.confidenceNote || "";

  setCached(companyName, role, result);
  return result;
}

function friendlyError(e) {
  switch (e?.code) {
    case "NO_KEY":         return { msg: "No API key — add yours in the Settings tab.", goSettings: true };
    case "BAD_KEY_FORMAT": return { msg: 'Key format wrong — it should start with "sk-ant-".', goSettings: true };
    case "AUTH":           return { msg: "API key rejected (401). Re-copy your full key from console.anthropic.com.", goSettings: true };
    case "RATE_LIMIT":     return { msg: "Rate limited (429). Wait 30 seconds and try again." };
    case "NETWORK":        return { msg: `Network error: ${e.detail || "cannot reach Anthropic"}. Check your internet.` };
    case "HTTP":           return { msg: `API error ${e.status}: ${e.detail || "unknown"}. Try again.` };
    case "NO_JSON":
    case "PARSE":          return { msg: "AI returned unexpected format. Try again." };
    default:               return { msg: `Error: ${e?.message || JSON.stringify(e)}` };
  }
}

// ── DESIGN TOKENS ─────────────────────────────────────────────────
const RISK = {
  LOW:    { bg:"#0d2b1a", border:"#1a5c35", text:"#4ade80" },
  MEDIUM: { bg:"#2b1f0a", border:"#854d0e", text:"#fbbf24" },
  HIGH:   { bg:"#2b0a0a", border:"#991b1b", text:"#f87171" },
};
const REC = {
  APPLY:   { icon:"✓", label:"Safe to Apply",        color:"#4ade80" },
  CAUTION: { icon:"⚠", label:"Proceed with Caution", color:"#fbbf24" },
  AVOID:   { icon:"✕", label:"Do Not Apply",          color:"#f87171" },
};
const OWN_COLORS = {
  Public:     { color:"#60a5fa", bg:"#0f1f35", border:"#1e3a5f" },
  Private:    { color:"#a78bfa", bg:"#1a0f35", border:"#3a1e5f" },
  "Non-Profit":{ color:"#34d399", bg:"#0f2b1a", border:"#1e5c35" },
  Government: { color:"#fbbf24", bg:"#2b1f0a", border:"#5c3a0e" },
  Unknown:    { color:"#4a6885", bg:"#0d1520", border:"#1e3a5f" },
};
const RISK_ORDER = { HIGH: 0, MEDIUM: 1, LOW: 2 };

// ── EXPORT HELPERS ────────────────────────────────────────────────
// ── EXPORT FOLDER (File System Access API, Chrome/Edge) ──────────
// The browser cannot open a typed path. Pick the folder once; the handle is
// remembered in IndexedDB and exports are written there with no dialog.
let exportDirHandle = null;
let exportNotify    = () => {};

function idbOpen() {
  return new Promise((res, rej) => {
    const r = indexedDB.open("jobguard", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("kv");
    r.onsuccess = () => res(r.result);
    r.onerror   = () => rej(r.error);
  });
}
async function idbGet(key) {
  const db = await idbOpen();
  return new Promise((res, rej) => { const q = db.transaction("kv").objectStore("kv").get(key); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
}
async function idbSet(key, val) {
  const db = await idbOpen();
  return new Promise((res, rej) => { const t = db.transaction("kv", "readwrite"); t.objectStore("kv").put(val, key); t.oncomplete = () => res(); t.onerror = () => rej(t.error); });
}
async function idbDel(key) {
  const db = await idbOpen();
  return new Promise((res, rej) => { const t = db.transaction("kv", "readwrite"); t.objectStore("kv").delete(key); t.oncomplete = () => res(); t.onerror = () => rej(t.error); });
}

async function writeToDir(name, text) {
  const fh = await exportDirHandle.getFileHandle(name, { create: true });
  const w  = await fh.createWritable();
  await w.write(text);
  await w.close();
}

async function saveFile(name, text, mime) {
  if (exportDirHandle) {
    try {
      await writeToDir(name, text);
      exportNotify({ ok: true, text: `Saved ${name} to ${exportDirHandle.name}` });
      return;
    } catch (err) {
      exportNotify({ ok: false, text: `Folder write failed (${err.message}); downloaded instead.` });
    }
  }
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a   = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

const TAB_FILES = {
  blacklist: "jobguard-blacklist.json",
  records:   "jobguard-records.json",
  favorites: "jobguard-favorites.json",
  agencies:  "jobguard-agencies.json",
};

function exportTab(kind, data) {
  saveFile(TAB_FILES[kind], JSON.stringify(data, null, 2), "application/json");
}

// Parse a single-tab export file; returns cleaned entries for that tab.
function parseTab(kind, text) {
  const data = JSON.parse(text);
  if (!Array.isArray(data)) throw new Error(`File is not a ${kind} list.`);
  if (kind === "blacklist")
    return data.filter(e => e && typeof e.name === "string" && e.name.trim())
      .map(e => ({ name: e.name.trim(), reason: typeof e.reason === "string" ? e.reason : "Imported" }));
  if (kind === "agencies")
    return data.filter(e => e && typeof e.name === "string" && e.name.trim())
      .map(e => ({ name: e.name.trim(), url: typeof e.url === "string" ? e.url : "", type: ORG_TYPES.includes(e.type) ? e.type : ORG_TYPES[0], note: typeof e.note === "string" ? e.note : "" }));
  const ok = data.filter(e => e && typeof e.company === "string" && e.id != null);
  if (data.length && !ok.length) throw new Error(`No ${kind} entries found in this file.`);
  return ok;
}

const BACKUP_NAME = "jobguard-all-records.json";

function buildBackup(blacklist, records, favs, orgs) {
  return JSON.stringify({ app: "jobguard", version: 1, exportedAt: new Date().toISOString(), blacklist, records, favorites: favs, agencies: orgs }, null, 2);
}

function exportAllRecords(blacklist, records, favs, orgs) {
  saveFile(BACKUP_NAME, buildBackup(blacklist, records, favs, orgs), "application/json");
}

function parseBackup(text) {
  const d = JSON.parse(text);
  if (!d || d.app !== "jobguard" || !Array.isArray(d.records) || !Array.isArray(d.favorites) || !Array.isArray(d.blacklist))
    throw new Error("Not a JobGuard backup file.");
  return d;
}

function blacklistWasEmpty() {
  try { return localStorage.getItem(STORAGE_KEY) === null; } catch { return true; }
}

function matchOrg(orgs, company) {
  const c = (company || "").toLowerCase().trim();
  if (!c) return null;
  const cd = extractDomain(c);
  return orgs.find(o => {
    const n = o.name.toLowerCase().trim();
    if (n && (n === c || (n.length >= 4 && (c.includes(n) || n.includes(c))))) return true;
    const od = o.url ? extractDomain(o.url) : "";
    return !!od && !!cd && od === cd;
  }) || null;
}

// Infer a firm type from the AI-reported companyType text (e.g. "Staffing Agency / Workforce Solutions").
function inferOrgType(companyType, orgType) {
  if (ORG_TYPES.includes(orgType)) return orgType;
  const t = (companyType || "").toLowerCase();
  if (/staffing|recruit|head-?hunt|talent|workforce|placement/.test(t)) return ORG_TYPES[0];
  if (/(it|technology|software|tech)\s+(consult|services)|systems integrat|it consult/.test(t)) return ORG_TYPES[1];
  return null;
}

function orgTypeFor(orgs, rec) {
  const m = matchOrg(orgs, rec.company);
  if (m) return { type: m.type, listed: true };
  const inf = inferOrgType(rec.companyType, rec.orgType);
  return inf ? { type: inf, listed: false } : null;
}

// ── COMPANY INTEL PILL ────────────────────────────────────────────
function IntelPill({ icon, label, value, dim }) {
  if (!value || value === "Unknown") return (
    <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
      <div style={{ fontSize:8, color:"#2a4a6a", letterSpacing:".1em", textTransform:"uppercase" }}>{label}</div>
      <div style={{ fontSize:11, color:"#2a4a6a", fontStyle:"italic" }}>Unknown</div>
    </div>
  );
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
      <div style={{ fontSize:8, color:"#2a5a8c", letterSpacing:".1em", textTransform:"uppercase" }}>{icon} {label}</div>
      <div style={{ fontSize:11, color: dim || "#8aafc8", fontWeight:500 }}>{value}</div>
    </div>
  );
}

// ── APP ───────────────────────────────────────────────────────────
export default function CompanyVetter() {
  const [tab, setTab]             = useState("vetter");
  const [companyName, setCompany] = useState("");
  const [companyUrl, setCompanyUrl] = useState("");
  const [role, setRole]           = useState("");
  const [blacklist, setBL]        = useState(loadBL);
  const [blReset, setBlReset]     = useState(blacklistWasEmpty);
  const restoreRef = useRef(null);
  const tabFileRef = useRef({});
  const [apiKey, setApiKey]       = useState(loadKey);
  const [result, setResult]       = useState(null);
  const [blHit, setBlHit]         = useState(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [records, setRecords]     = useState(loadRecords);
  const [newEntry, setNewEntry]   = useState({ name:"", reason:"" });
  const [showAddForm, setShowAddForm] = useState(false);
  const [keySaved, setKeySaved]   = useState(false);
  const [testing, setTesting]     = useState(false);
  const [testMsg, setTestMsg]     = useState(null);
  const [recSearch, setRecSearch] = useState("");
  const [recFilter, setRecFilter] = useState("ALL");
  const [recSort, setRecSort]     = useState("newest");
  const [expandedRec, setExpandedRec] = useState(null);
  const [hoveredRec, setHoveredRec] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [favs, setFavs]           = useState(loadFavs);
  const [orgs, setOrgs]           = useState(loadOrgs);
  const [orgForm, setOrgForm]     = useState({ name:"", url:"", type:ORG_TYPES[0], note:"" });
  const [showOrgForm, setShowOrgForm] = useState(false);
  const [favSearch, setFavSearch] = useState("");
  const [expandedFav, setExpandedFav] = useState(null);
  const [confirmRemoveFav, setConfirmRemoveFav] = useState(null);
  const inputRef = useRef(null);

  // Merge an imported single-tab file into that tab's data (never deletes anything).
  const importTab = async (kind, file) => {
    if (!file) return;
    try {
      const incoming = parseTab(kind, await file.text());
      const byName = cur => { const have = new Set(cur.map(e => e.name.toLowerCase())); return [...cur, ...incoming.filter(e => !have.has(e.name.toLowerCase()))]; };
      const byId = cur => { const have = new Set(cur.map(e => e.id)); return [...cur, ...incoming.filter(e => !have.has(e.id))]; };
      if (kind === "blacklist") { setBL(byName); setBlReset(false); }
      else if (kind === "agencies") setOrgs(byName);
      else if (kind === "records") setRecords(cur => byId(cur).sort((a, b) => (b.ts || 0) - (a.ts || 0)));
      else setFavs(byId);
      setExportMsg({ ok: true, text: `Imported ${incoming.length} ${kind} from file (merged, nothing deleted).` });
    } catch (err) {
      setExportMsg({ ok: false, text: `Import failed: ${err.message}` });
    }
    const el = tabFileRef.current[kind];
    if (el) el.value = "";
  };
  const tabImportInput = (kind) => (
    <input data-testid={`import-${kind}`} ref={el => { tabFileRef.current[kind] = el; }} type="file" accept=".json,application/json" style={{ display:"none" }} onChange={e => importTab(kind, e.target.files[0])} />
  );
  const pickTabFile = (kind) => tabFileRef.current[kind] && tabFileRef.current[kind].click();

  const addOrg = () => {
    const name = orgForm.name.trim();
    if (!name) return;
    setOrgs(cur => cur.some(e => e.name.toLowerCase() === name.toLowerCase())
      ? cur.map(e => e.name.toLowerCase() === name.toLowerCase() ? { ...e, url: orgForm.url.trim(), type: orgForm.type, note: orgForm.note.trim() } : e)
      : [...cur, { name, url: orgForm.url.trim(), type: orgForm.type, note: orgForm.note.trim() }]);
    setOrgForm({ name:"", url:"", type:ORG_TYPES[0], note:"" });
    setShowOrgForm(false);
  };
  const scanRecordsForOrgs = () => {
    const next = [...orgs];
    records.forEach(r => {
      const inf = inferOrgType(r.companyType, r.orgType);
      if (inf && !next.some(e => e.name.toLowerCase() === r.company.toLowerCase())) next.push({ name: r.company, url: "", type: inf, note: "Auto-added from vetting" });
    });
    const added = next.length - orgs.length;
    if (added) setOrgs(next);
    setExportMsg({ ok: true, text: added ? `Added ${added} firms found in Records.` : "No new staffing or consulting firms found in Records." });
  };
  const [dirName, setDirName]     = useState(null);
  const [dirState, setDirState]   = useState("none"); // none | needs-permission | ready
  const [exportMsg, setExportMsg] = useState(null);
  const fsSupported = typeof window !== "undefined" && "showDirectoryPicker" in window;

  useEffect(() => { exportNotify = setExportMsg; return () => { exportNotify = () => {}; }; }, []);

  useEffect(() => {
    if (!fsSupported) return;
    (async () => {
      try {
        const h = await idbGet("exportDir");
        if (!h) return;
        setDirName(h.name);
        if ((await h.queryPermission({ mode: "readwrite" })) === "granted") { exportDirHandle = h; setDirState("ready"); }
        else setDirState("needs-permission");
      } catch { /* no saved folder */ }
    })();
  }, [fsSupported]);

  const chooseFolder = async () => {
    setExportMsg({ ok: true, text: "Opening folder picker… (if nothing appears, check behind this window)" });
    let h;
    try {
      h = await window.showDirectoryPicker({ id: "jobguard-export", mode: "readwrite" });
    } catch (err) {
      console.error("showDirectoryPicker failed", err);
      setExportMsg({ ok: false, text: err.name === "AbortError" ? "No folder selected (picker closed or the folder is blocked by Chrome). Pick a normal subfolder, not Desktop, Documents, Downloads or a drive root." : `Picker error: ${err.name}: ${err.message}` });
      return;
    }
    exportDirHandle = h; setDirName(h.name); setDirState("ready");
    try { await idbSet("exportDir", h); }
    catch (err) { console.error("idbSet failed", err); setExportMsg({ ok: false, text: `Folder works now but could not be remembered for next time: ${err.message}` }); return; }
    setExportMsg({ ok: true, text: `Export folder set to ${h.name}` });
  };
  const reconnectFolder = async () => {
    try {
      const h = await idbGet("exportDir");
      if (h && (await h.requestPermission({ mode: "readwrite" })) === "granted") { exportDirHandle = h; setDirState("ready"); setExportMsg({ ok: true, text: `Reconnected to ${h.name}` }); }
    } catch (err) { setExportMsg({ ok: false, text: `Reconnect failed: ${err.message}` }); }
  };
  const forgetFolder = async () => {
    try { await idbDel("exportDir"); } catch { /* ignore */ }
    exportDirHandle = null; setDirName(null); setDirState("none");
    setExportMsg({ ok: true, text: "Export folder cleared. Exports download normally." });
  };

  // Merge a backup into current data (never deletes anything already here).
  const applyBackup = (d) => {
    setBL(cur => { const have = new Set(cur.map(e => e.name.toLowerCase())); return [...cur, ...d.blacklist.filter(e => e && typeof e.name === "string" && !have.has(e.name.toLowerCase()))]; });
    setRecords(cur => { const have = new Set(cur.map(r => r.id)); return [...cur, ...d.records.filter(r => r && !have.has(r.id))].sort((a, b) => (b.ts || 0) - (a.ts || 0)); });
    setFavs(cur => { const have = new Set(cur.map(f => f.id)); return [...cur, ...d.favorites.filter(f => f && !have.has(f.id))]; });
    if (Array.isArray(d.agencies)) setOrgs(cur => { const have = new Set(cur.map(e => e.name.toLowerCase())); return [...cur, ...d.agencies.filter(e => e && typeof e.name === "string" && !have.has(e.name.toLowerCase()))]; });
    setExportMsg({ ok: true, text: `Restored: ${d.records.length} records, ${d.favorites.length} favorites, ${d.blacklist.length} blacklist entries (merged).` });
  };
  const restoreFromFile = async (file) => {
    if (!file) return;
    try { applyBackup(parseBackup(await file.text())); }
    catch (err) { setExportMsg({ ok: false, text: `Restore failed: ${err.message}` }); }
    if (restoreRef.current) restoreRef.current.value = "";
  };
  const restoreFromFolder = async () => {
    try {
      const fh = await exportDirHandle.getFileHandle(BACKUP_NAME);
      applyBackup(parseBackup(await (await fh.getFile()).text()));
    } catch (err) { setExportMsg({ ok: false, text: `No usable ${BACKUP_NAME} in folder (${err.message}).` }); }
  };

  // Auto-save everything to the export folder on any change. Skipped while the app
  // holds only default/empty data so a cleared browser can never overwrite a good backup.
  useEffect(() => {
    const fresh = records.length === 0 && favs.length === 0 && orgs.length === 0 && JSON.stringify(blacklist) === JSON.stringify(DEFAULT_BLACKLIST);
    if (dirState === "ready" && exportDirHandle && !fresh)
      writeToDir(BACKUP_NAME, buildBackup(blacklist, records, favs, orgs)).catch(() => {});
  }, [blacklist, records, favs, orgs, dirState]);

  useEffect(() => { saveBL(blacklist); },    [blacklist]);
  useEffect(() => { saveKey(apiKey); },      [apiKey]);
  useEffect(() => { saveRecords(records); }, [records]);
  useEffect(() => { saveFavs(favs); }, [favs]);
  useEffect(() => { saveOrgs(orgs); }, [orgs]);

  const checkBL = (name) => {
    const lower = name.toLowerCase().trim();
    return blacklist.find(e => e.name.toLowerCase().includes(lower) || lower.includes(e.name.toLowerCase()));
  };

  const addRecord = (company, role, res, url) => {
    const record = {
      id: Date.now(), ts: Date.now(),
      company: company.trim(), role: role.trim(),
      riskLevel: res.riskLevel, recommendation: res.recommendation,
      verdict: res.verdict,
      redFlags: res.redFlags, greenFlags: res.greenFlags,
      verificationSteps: res.verificationSteps,
      companyType: res.companyType,
      orgType: res.orgType,
      ownership: res.ownership,
      headcount: res.headcount,
      annualRevenue: res.annualRevenue,
      founded: res.founded,
      headquarters: res.headquarters,
      url: url || "",
      website: siteFor(url, res),
      confidenceNote: res.confidenceNote,
      fromCache: !!res.fromCache,
    };
    const inferred = inferOrgType(res.companyType, res.orgType);
    if (inferred) setOrgs(cur => cur.some(e => e.name.toLowerCase() === company.trim().toLowerCase()) ? cur : [...cur, { name: company.trim(), url: "", type: inferred, note: "Auto-added from vetting" }]);
    setRecords(prev => {
      const idx = prev.findIndex(r =>
        r.company.toLowerCase() === company.toLowerCase() &&
        r.role.toLowerCase() === (role||"").toLowerCase()
      );
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = { ...record, id: prev[idx].id, firstVetted: prev[idx].firstVetted || prev[idx].ts };
        return updated;
      }
      return [{ ...record, firstVetted: record.ts }, ...prev];
    });
  };

  const handleVet = async () => {
    let name = companyName.trim();
    const urlVal = companyUrl.trim();
    if (!name && urlVal) {
      const domain = extractDomain(urlVal);
      if (domain) { name = domain; setCompany(domain); }
    }
    if (!name) return;
    setError(null); setResult(null); setBlHit(null);
    const hit = checkBL(name);
    if (hit) { setBlHit(hit); return; }
    setLoading(true);
    try {
      const res = await vetCompanyWithAI(name, role.trim(), apiKey, urlVal || undefined);
      setResult(res);
      addRecord(name, role, res, urlVal);
    } catch (e) {
      setError(friendlyError(e));
    } finally { setLoading(false); }
  };

  const handleTestKey = async () => {
    setTesting(true); setTestMsg(null);
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type":"application/json", "x-api-key":apiKey.trim(), "anthropic-version":"2023-06-01", "anthropic-dangerous-direct-browser-access":"true" },
        body: JSON.stringify({ model:"claude-haiku-4-5-20251001", max_tokens:10, messages:[{role:"user",content:"Say OK"}] }),
      });
      if (r.ok)                                setTestMsg({ ok:true,  text:"✓ API key is valid and working!" });
      else if (r.status===401||r.status===403) setTestMsg({ ok:false, text:"Key rejected (401) — re-copy it from console.anthropic.com." });
      else                                     setTestMsg({ ok:false, text:`HTTP ${r.status} — check key and try again.` });
    } catch (e) { setTestMsg({ ok:false, text:`Network error: ${e.message}` }); }
    setTesting(false);
  };

  const isFav = (id) => favs.some(f => f.id === id);

  const toggleFav = (rec) => {
    setFavs(prev => {
      const exists = prev.some(f => f.id === rec.id);
      if (exists) return prev.filter(f => f.id !== rec.id);
      return [{ ...rec, favoritedAt: Date.now() }, ...prev];
    });
  };

  const removeFav = (id) => {
    setFavs(prev => prev.filter(f => f.id !== id));
    setConfirmRemoveFav(null);
    if (expandedFav === id) setExpandedFav(null);
  };

  const deleteRecord = (id) => {
    setRecords(prev => prev.filter(r => r.id !== id));
    if (expandedRec === id) setExpandedRec(null);
    setConfirmDelete(null);
  };
  const clearAllRecords = () => {
    setRecords([]);
    setExpandedRec(null);
    setConfirmClearAll(false);
  };

  const filteredRecords = records
    .filter(r => {
      const matchSearch = !recSearch ||
        r.company.toLowerCase().includes(recSearch.toLowerCase()) ||
        (r.role||"").toLowerCase().includes(recSearch.toLowerCase()) ||
        (r.companyType||"").toLowerCase().includes(recSearch.toLowerCase());
      const om = orgTypeFor(orgs, r);
      const matchFilter = recFilter === "ALL" || (recFilter === "ORG_ANY" && !!om) || (recFilter === "ORG_NONE" && !om) || (om && om.type === recFilter) || r.riskLevel === recFilter || r.recommendation === recFilter || r.ownership === recFilter;
      return matchSearch && matchFilter;
    })
    .sort((a, b) => {
      if (recSort === "newest") return b.ts - a.ts;
      if (recSort === "oldest") return a.ts - b.ts;
      if (recSort === "risk")   return (RISK_ORDER[a.riskLevel]??3) - (RISK_ORDER[b.riskLevel]??3);
      if (recSort === "az")     return a.company.localeCompare(b.company);
      return 0;
    });

  const stats = {
    total:   records.length,
    high:    records.filter(r => r.riskLevel === "HIGH").length,
    caution: records.filter(r => r.recommendation === "CAUTION").length,
    apply:   records.filter(r => r.recommendation === "APPLY").length,
    public:  records.filter(r => r.ownership === "Public").length,
    private: records.filter(r => r.ownership === "Private").length,
  };

  const riskCfg = result ? RISK[result.riskLevel] : null;
  const ownCfg  = result ? (OWN_COLORS[result.ownership] || OWN_COLORS.Unknown) : null;

  return (
    <div style={{ minHeight:"100vh", background:"#080c10", fontFamily:"'DM Mono','Courier New',monospace", color:"#c8d6e5" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Syne:wght@700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-track{background:#0d1117} ::-webkit-scrollbar-thumb{background:#1e3a5f;border-radius:2px}
        input,select{outline:none} button{cursor:pointer;border:none;background:none}
        @keyframes slide-in{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(248,113,113,.4)}50%{box-shadow:0 0 0 8px rgba(248,113,113,0)}}
        .si{animation:slide-in .25s ease}
        .spin{width:16px;height:16px;border:2px solid #1e3a5f;border-top-color:#4a9eff;border-radius:50%;animation:spin .7s linear infinite;display:inline-block;vertical-align:middle;margin-right:7px}
        .field{width:100%;background:#0d1520;border:1px solid #1e3a5f;border-radius:6px;padding:11px 13px;color:#c8d6e5;font-family:'DM Mono',monospace;font-size:13px;transition:border-color .2s;margin-bottom:10px}
        .field:focus{border-color:#4a9eff} .field::placeholder{color:#2a4a6a}
        .sel{background:#0d1520;border:1px solid #1e3a5f;border-radius:6px;padding:7px 10px;color:#c8d6e5;font-family:'DM Mono',monospace;font-size:11px}
        .tab{padding:8px 16px;font-family:'DM Mono',monospace;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#4a6885;border-bottom:2px solid transparent;transition:all .15s;background:none;border-left:none;border-right:none;border-top:none;white-space:nowrap}
        .tab:hover{color:#c8d6e5} .tab.on{color:#4a9eff;border-bottom-color:#4a9eff}
        .primary-btn{width:100%;padding:13px;background:linear-gradient(135deg,#1a3a5c,#0f2540);border:1px solid #2a5a8c;border-radius:6px;color:#4a9eff;font-family:'DM Mono',monospace;font-size:12px;font-weight:500;letter-spacing:.12em;text-transform:uppercase;transition:all .2s}
        .primary-btn:hover:not(:disabled){background:linear-gradient(135deg,#2a4a6c,#1f3550);border-color:#4a9eff}
        .primary-btn:disabled{opacity:.4;cursor:not-allowed}
        .danger-btn{padding:8px 14px;background:#1a0a0a;border:1px solid #7f1d1d;border-radius:5px;color:#f87171;font-family:'DM Mono',monospace;font-size:11px;transition:all .15s}
        .danger-btn:hover{background:#2b0808;border-color:#f87171}
        .ghost-btn{padding:8px 14px;background:#0d1520;border:1px solid #1e3a5f;border-radius:5px;color:#4a6885;font-family:'DM Mono',monospace;font-size:11px;transition:all .15s}
        .ghost-btn:hover{color:#c8d6e5;border-color:#4a6885}
        .icon-btn{padding:5px 10px;background:#0d1520;border:1px solid #1a2f4a;border-radius:4px;color:#4a6885;font-family:'DM Mono',monospace;font-size:10px;transition:all .15s}
        .icon-btn:hover{color:#c8d6e5;border-color:#4a6885}
        .bl-row{display:flex;align-items:flex-start;gap:10px;padding:10px 12px;background:#0d1520;border:1px solid #1a2f4a;border-radius:6px;margin-bottom:8px}
        .rm-btn{padding:3px 9px;background:#2b0a0a;border:1px solid #7f1d1d;border-radius:3px;color:#f87171;font-size:10px;font-family:'DM Mono',monospace;flex-shrink:0;transition:all .15s}
        .rm-btn:hover{background:#3f1010}
        .rec-card{background:#0a1218;border:1px solid #1a2f4a;border-radius:8px;margin-bottom:8px;overflow:hidden;transition:border-color .15s}
        .rec-card:hover{border-color:#2a4a6a}
        .rec-card-header{display:flex;align-items:center;gap:10px;padding:11px 14px;cursor:pointer}
        .rec-card-body{padding:14px 16px;border-top:1px solid #0d1a2a;animation:slide-in .2s ease}
        .badge{display:inline-flex;align-items:center;padding:2px 8px;border-radius:3px;border:1px solid;font-size:9px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;flex-shrink:0}
        .stat-box{background:#0a1218;border:1px solid #1a2f4a;border-radius:6px;padding:10px 14px;text-align:center;flex:1}
        .intel-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;background:#060d14;border:1px solid #1a2f4a;border-radius:8px;padding:12px 14px;margin-bottom:12px}
        .divider{height:1px;background:#0d1a2a;margin:12px 0}
      `}</style>

      {/* ── HEADER ── */}
      <div style={{ background:"linear-gradient(180deg,#0a1520,#080c10)", borderBottom:"1px solid #1a2f4a", padding:"18px 22px 0" }}>
        <div style={{ maxWidth:820, margin:"0 auto" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:4 }}>
            <div>
              <div style={{ fontFamily:"'Syne',sans-serif", fontSize:22, fontWeight:800, color:"#e2eaf4" }}>
                <span style={{ color:"#4a9eff" }}>JOB</span>GUARD
              </div>
              <div style={{ fontSize:9, color:"#2a5a8c", letterSpacing:".15em", textTransform:"uppercase", marginTop:2 }}>Company Intelligence & Vetting</div>
            </div>
            <div style={{ textAlign:"right", fontSize:10, color:"#2a4a6a" }}>
              <div style={{ color:"#f87171", fontSize:13 }}>⬡ {blacklist.length}</div><div>blacklisted</div>
              <div style={{ color:"#4a9eff", fontSize:13, marginTop:4 }}>📋 {records.length}</div><div>vetted</div>
              <div style={{ color:"#fbbf24", fontSize:13, marginTop:4 }}>★ {favs.length}</div><div>favorites</div>
            </div>
          </div>
          <div style={{ display:"flex", gap:0, marginTop:14, overflowX:"auto" }}>
            {[["vetter","Vet"],["records","📋 Records"],["favs","★ Favorites"],["agencies","🏢 Agencies"],["blacklist","Blacklist"],["settings","⚙ Settings"]].map(([t,label]) => (
              <button key={t} className={`tab${tab===t?" on":""}`} onClick={() => setTab(t)}>{label}</button>
            ))}
            <input data-testid="restore-input" ref={restoreRef} type="file" accept=".json,application/json" style={{ display:"none" }} onChange={e => restoreFromFile(e.target.files[0])} />
          </div>
        </div>
      </div>

      <div style={{ maxWidth:820, margin:"0 auto", padding:"22px 22px" }}>

        {/* ══ VET TAB ══ */}
        {tab === "vetter" && (
          <div className="si">
            <input ref={inputRef} className="field" placeholder="Company name  e.g. Anthropic, Google, QuickHire Solutions..." value={companyName} onChange={e=>setCompany(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleVet()} />
            <div style={{ position:"relative", marginBottom:10 }}>
              <input
                className="field"
                style={{ marginBottom:0, paddingLeft:34 }}
                placeholder="Homepage URL (optional)  e.g. https://anthropic.com"
                value={companyUrl}
                onChange={e => {
                  setCompanyUrl(e.target.value);
                  if (!companyName.trim() && e.target.value.trim()) {
                    const d = extractDomain(e.target.value.trim());
                    if (d) setCompany(d);
                  }
                }}
                onKeyDown={e=>e.key==="Enter"&&handleVet()}
              />
              <span style={{ position:"absolute", left:11, top:"50%", transform:"translateY(-50%)", fontSize:13, pointerEvents:"none", color:"#2a5a8c" }}>🔗</span>
            </div>
            <input className="field" placeholder="Role / Position (optional)" value={role} onChange={e=>setRole(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleVet()} />
            <button className="primary-btn" onClick={handleVet} disabled={loading||(!companyName.trim()&&!companyUrl.trim())} style={{ marginBottom:16 }}>
              {loading ? <><span className="spin"/>Analyzing...</> : "▶  Run Vetting Check"}
            </button>

            {error && (
              <div className="si" style={{ background:"#1a0a0a", border:"1px solid #7f1d1d", borderRadius:8, padding:"14px 16px", marginBottom:16 }}>
                <div style={{ color:"#f87171", fontSize:12, lineHeight:1.6 }}>⚠ {error.msg}</div>
                {error.goSettings && <button onClick={()=>setTab("settings")} style={{ marginTop:8, padding:"6px 12px", background:"#0d1520", border:"1px solid #1e3a5f", borderRadius:4, color:"#4a9eff", fontFamily:"'DM Mono',monospace", fontSize:11 }}>→ Open Settings</button>}
              </div>
            )}

            {blHit && (
              <div className="si" style={{ background:"#1a0505", border:"1px solid #7f1d1d", borderRadius:8, padding:"16px", marginBottom:16, animation:"pulse 2s ease 3" }}>
                <div style={{ display:"flex", gap:12, alignItems:"center", marginBottom:10 }}>
                  <span style={{ fontSize:26 }}>🚫</span>
                  <div>
                    <div style={{ color:"#f87171", fontWeight:700, fontSize:14 }}>BLACKLISTED COMPANY</div>
                    <div style={{ color:"#7f1d1d", fontSize:11, marginTop:2 }}>Do not apply — flagged in your blacklist</div>
                  </div>
                </div>
                <div style={{ background:"#2b0808", borderRadius:6, padding:"9px 11px" }}>
                  <div style={{ fontSize:9, color:"#7f1d1d", letterSpacing:".12em", textTransform:"uppercase", marginBottom:3 }}>Reason Flagged</div>
                  <div style={{ fontSize:12, color:"#fca5a5" }}>{blHit.reason}</div>
                </div>
              </div>
            )}

            {result && !blHit && (
              <div className="si">
                {/* Risk + recommendation banner */}
                <div style={{ background:riskCfg.bg, border:`1px solid ${riskCfg.border}`, borderRadius:"8px 8px 0 0", padding:"14px 16px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <div>
                    <div style={{ fontSize:9, color:riskCfg.text, letterSpacing:".14em", textTransform:"uppercase", opacity:.7, marginBottom:3 }}>Risk Assessment</div>
                    <div style={{ fontFamily:"'Syne',sans-serif", fontSize:20, fontWeight:800, color:riskCfg.text }}>{result.riskLevel} RISK</div>
                    <div style={{ fontSize:12, color:riskCfg.text, opacity:.8, marginTop:3 }}>{result.verdict}</div>
                  </div>
                  <div style={{ textAlign:"center" }}>
                    <div style={{ fontSize:26, color:REC[result.recommendation]?.color }}>{REC[result.recommendation]?.icon}</div>
                    <div style={{ fontSize:9, color:REC[result.recommendation]?.color, textTransform:"uppercase", letterSpacing:".08em", marginTop:3 }}>{REC[result.recommendation]?.label}</div>
                    {result.fromCache && <div style={{ fontSize:9, color:"#1a3a5f", marginTop:4 }}>⬡ cached</div>}
                  </div>
                </div>

                <div style={{ background:"#0a1218", border:`1px solid ${riskCfg.border}`, borderTop:"none", borderRadius:"0 0 8px 8px", padding:"14px 16px", marginBottom:14 }}>
                  {!companyUrl.trim() && (
                    <div data-testid="vetted-site" style={{ display:"flex", alignItems:"center", gap:6, marginBottom:10, padding:"6px 10px", background:"#060d14", borderRadius:5, border:"1px solid #1a2f4a", fontSize:10, color:"#2a5a8c" }}>
                      <span>🏢</span><b style={{ color:"#c8d6e5", fontWeight:500 }}>{companyName.trim()}</b>
                      <span>·</span><span>🌐</span>
                      {siteFor("", result) ? <><a href={"https://" + siteFor("", result)} target="_blank" rel="noopener noreferrer" style={{ color:"#4a9eff", textDecoration:"none" }}>{siteFor("", result)}</a><span>(AI suggested, verify it yourself)</span></> : <span>website unknown</span>}
                    </div>
                  )}
                  {companyUrl.trim() && (
                    <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:10, padding:"6px 10px", background:"#060d14", borderRadius:5, border:"1px solid #1a2f4a" }}>
                      <span style={{ fontSize:11, color:"#2a5a8c" }}>🔗</span>
                      <span style={{ fontSize:10, color:"#2a5a8c", letterSpacing:".08em", textTransform:"uppercase", flexShrink:0 }}>Vetted via URL:</span>
                      <a href={companyUrl.trim().startsWith("http") ? companyUrl.trim() : "https://"+companyUrl.trim()} target="_blank" rel="noopener noreferrer" style={{ fontSize:10, color:"#4a9eff", textDecoration:"none", wordBreak:"break-all" }}>{companyUrl.trim()}</a>
                    </div>
                  )}

                  {/* Company intel strip */}
                  <div className="intel-grid">
                    <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                      <div style={{ fontSize:8, color:"#2a5a8c", letterSpacing:".1em", textTransform:"uppercase" }}>🏢 Type</div>
                      <div style={{ fontSize:11, color:"#8aafc8", fontWeight:500 }}>{result.companyType || "Unknown"}</div>
                    </div>
                    <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                      <div style={{ fontSize:8, color:"#2a5a8c", letterSpacing:".1em", textTransform:"uppercase" }}>📊 Ownership</div>
                      <span style={{ fontSize:11, fontWeight:600, color: ownCfg.color }}>{result.ownership || "Unknown"}</span>
                    </div>
                    <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                      <div style={{ fontSize:8, color:"#2a5a8c", letterSpacing:".1em", textTransform:"uppercase" }}>👥 Headcount</div>
                      <div style={{ fontSize:11, color:"#8aafc8" }}>{result.headcount || "Unknown"}</div>
                    </div>
                    <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                      <div style={{ fontSize:8, color:"#2a5a8c", letterSpacing:".1em", textTransform:"uppercase" }}>💰 Revenue</div>
                      <div style={{ fontSize:11, color:"#8aafc8" }}>{result.annualRevenue || "Unknown"}</div>
                    </div>
                    <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                      <div style={{ fontSize:8, color:"#2a5a8c", letterSpacing:".1em", textTransform:"uppercase" }}>📅 Founded</div>
                      <div style={{ fontSize:11, color:"#8aafc8" }}>{result.founded || "Unknown"}</div>
                    </div>
                    <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                      <div style={{ fontSize:8, color:"#2a5a8c", letterSpacing:".1em", textTransform:"uppercase" }}>📍 HQ</div>
                      <div style={{ fontSize:11, color:"#8aafc8" }}>{result.headquarters || "Unknown"}</div>
                    </div>
                  </div>
                  {result.confidenceNote && (
                    <div style={{ fontSize:10, color:"#2a4a6a", fontStyle:"italic", marginBottom:12, paddingLeft:4 }}>ℹ {result.confidenceNote}</div>
                  )}

                  <div className="divider" />

                  {/* Flags */}
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
                    <div>
                      <div style={{ fontSize:9, color:"#7f1d1d", letterSpacing:".12em", textTransform:"uppercase", marginBottom:6 }}>🚩 Red Flags</div>
                      {result.redFlags.length ? result.redFlags.map((f,i) => <div key={i} style={{ fontSize:11, color:"#fca5a5", marginBottom:4, paddingLeft:8, borderLeft:"2px solid #7f1d1d" }}>{f}</div>) : <div style={{ fontSize:11, color:"#2a4a6a" }}>None identified</div>}
                    </div>
                    <div>
                      <div style={{ fontSize:9, color:"#14532d", letterSpacing:".12em", textTransform:"uppercase", marginBottom:6 }}>✓ Green Flags</div>
                      {result.greenFlags.length ? result.greenFlags.map((f,i) => <div key={i} style={{ fontSize:11, color:"#86efac", marginBottom:4, paddingLeft:8, borderLeft:"2px solid #14532d" }}>{f}</div>) : <div style={{ fontSize:11, color:"#2a4a6a" }}>None identified</div>}
                    </div>
                  </div>

                  <div style={{ fontSize:9, color:"#2a5a8c", letterSpacing:".12em", textTransform:"uppercase", marginBottom:8 }}>🔍 Verification Steps</div>
                  {result.verificationSteps.map((s,i) => (
                    <div key={i} style={{ display:"flex", gap:7, marginBottom:6, alignItems:"flex-start" }}>
                      <div style={{ width:16, height:16, background:"#0f2540", border:"1px solid #1e3a5f", borderRadius:3, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, color:"#4a9eff", marginTop:1 }}>{i+1}</div>
                      <div style={{ fontSize:11, color:"#8aafc8", lineHeight:1.5 }}>{s}</div>
                    </div>
                  ))}

                  <div style={{ display:"flex", gap:8, paddingTop:10, borderTop:"1px solid #0d1a2a", marginTop:4 }}>
                    <button className="danger-btn" onClick={() => { setBL(b=>[...b,{name:companyName.trim(),reason:result.verdict}]); setTab("blacklist"); }}>+ Blacklist</button>
                    <button
                      onClick={() => { const rec = records.find(r => r.company.toLowerCase()===companyName.toLowerCase()); if(rec) toggleFav(rec); }}
                      style={{ padding:"8px 14px", background: records.find(r=>r.company.toLowerCase()===companyName.toLowerCase()) && isFav(records.find(r=>r.company.toLowerCase()===companyName.toLowerCase())?.id) ? "#1a2f0a":"#0d1520", border:"1px solid", borderColor: records.find(r=>r.company.toLowerCase()===companyName.toLowerCase()) && isFav(records.find(r=>r.company.toLowerCase()===companyName.toLowerCase())?.id) ? "#3a6020":"#1e3a5f", borderRadius:5, color: records.find(r=>r.company.toLowerCase()===companyName.toLowerCase()) && isFav(records.find(r=>r.company.toLowerCase()===companyName.toLowerCase())?.id) ? "#86efac":"#4a6885", fontFamily:"'DM Mono',monospace", fontSize:13, cursor:"pointer", transition:"all .15s" }}
                    >{records.find(r=>r.company.toLowerCase()===companyName.toLowerCase()) && isFav(records.find(r=>r.company.toLowerCase()===companyName.toLowerCase())?.id) ? "★ Favorited" : "☆ Favorite"}</button>
                    <button className="ghost-btn" onClick={() => setTab("records")}>📋 Records</button>
                    <button className="ghost-btn" onClick={() => { setResult(null); setCompany(""); setCompanyUrl(""); setRole(""); inputRef.current?.focus(); }}>Clear</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ RECORDS TAB ══ */}
        {tab === "records" && (
          <div className="si">
            {/* Stats */}
            <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
              {[
                { label:"Total",    val:stats.total,   color:"#4a9eff" },
                { label:"High Risk",val:stats.high,    color:"#f87171" },
                { label:"Caution",  val:stats.caution, color:"#fbbf24" },
                { label:"Safe",     val:stats.apply,   color:"#4ade80" },
                { label:"Public",   val:stats.public,  color:"#60a5fa" },
                { label:"Private",  val:stats.private, color:"#a78bfa" },
              ].map(s => (
                <div key={s.label} className="stat-box">
                  <div style={{ fontSize:18, fontWeight:700, color:s.color, fontFamily:"'Syne',sans-serif" }}>{s.val}</div>
                  <div style={{ fontSize:9, color:"#4a6885", letterSpacing:".1em", textTransform:"uppercase", marginTop:2 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Controls */}
            <div style={{ display:"flex", gap:8, marginBottom:10, flexWrap:"wrap" }}>
              <input className="field" style={{ flex:2, minWidth:140, marginBottom:0 }} placeholder="Search company, role, or type..." value={recSearch} onChange={e=>setRecSearch(e.target.value)} />
              <select className="sel" value={recFilter} onChange={e=>setRecFilter(e.target.value)}>
                <option value="ALL">All</option>
                <optgroup label="── Firm type ──">
                  <option value="ORG_ANY">Agencies / Consulting (all)</option>
                  <option value="Staffing / Recruiter">Staffing / Recruiter</option>
                  <option value="IT Consulting">IT Consulting</option>
                  <option value="ORG_NONE">Direct employers (not listed)</option>
                </optgroup>
                <optgroup label="── Risk ──">
                  <option value="HIGH">High Risk</option>
                  <option value="MEDIUM">Medium Risk</option>
                  <option value="LOW">Low Risk</option>
                </optgroup>
                <optgroup label="── Recommendation ──">
                  <option value="AVOID">Avoid</option>
                  <option value="CAUTION">Caution</option>
                  <option value="APPLY">Apply</option>
                </optgroup>
                <optgroup label="── Ownership ──">
                  <option value="Public">Public</option>
                  <option value="Private">Private</option>
                  <option value="Non-Profit">Non-Profit</option>
                </optgroup>
              </select>
              <select className="sel" value={recSort} onChange={e=>setRecSort(e.target.value)}>
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="risk">Highest Risk</option>
                <option value="az">A → Z</option>
              </select>
            </div>

            <div style={{ display:"flex", gap:8, marginBottom:12, justifyContent:"flex-end", alignItems:"center" }}>
              <span style={{ fontSize:10, color:"#2a4a6a", marginRight:"auto" }}>Showing {filteredRecords.length} of {records.length}</span>
              <button data-testid="export-records" className="icon-btn" disabled={records.length === 0} onClick={() => exportTab("records", filteredRecords)}>⬇ Export</button>
              <button className="icon-btn" onClick={() => pickTabFile("records")}>⬆ Import</button>
              {tabImportInput("records")}
              {records.length > 0 && (confirmClearAll ? (
                <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                  <span style={{ fontSize:10, color:"#f87171" }}>Clear all {records.length} records?</span>
                  <button className="icon-btn" style={{ color:"#f87171", borderColor:"#7f1d1d" }} onClick={clearAllRecords}>Yes, clear</button>
                  <button className="icon-btn" onClick={() => setConfirmClearAll(false)}>Cancel</button>
                </div>
              ) : (
                <button className="icon-btn" style={{ color:"#f87171", borderColor:"#7f1d1d" }} onClick={() => setConfirmClearAll(true)}>🗑 Clear All</button>
              ))}
            </div>
            {exportMsg && <div style={{ fontSize:11, marginBottom:12, color: exportMsg.ok ? "#4ade80" : "#f87171" }}>{exportMsg.text}</div>}

            {filteredRecords.length === 0 ? (
              <div style={{ textAlign:"center", padding:"48px 0", color:"#2a4a6a", fontSize:12 }}>
                {records.length === 0 ? "No records yet — vet a company to build your database" : "No records match your filter"}
              </div>
            ) : filteredRecords.map(rec => {
              const rc = RISK[rec.riskLevel] || RISK.MEDIUM;
              const rv = REC[rec.recommendation] || REC.CAUTION;
              const oc = OWN_COLORS[rec.ownership] || OWN_COLORS.Unknown;
              const isExpanded = expandedRec === rec.id;
              return (
                <div key={rec.id} className="rec-card" style={{ borderColor: isExpanded ? rc.border : undefined }} onMouseEnter={() => setHoveredRec(rec.id)} onMouseLeave={() => setHoveredRec(null)}>
                  <div className="rec-card-header" onClick={() => setExpandedRec(isExpanded ? null : rec.id)}>
                    <div style={{ width:3, height:40, background:rc.text, borderRadius:2, flexShrink:0 }} />
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, color:"#e2eaf4", fontWeight:600, marginBottom:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{rec.company}</div>
                      <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                        {rec.role && <span style={{ fontSize:10, color:"#4a6885" }}>{rec.role}</span>}
                        {rec.companyType && rec.companyType !== "Unknown" && <span style={{ fontSize:9, color:"#2a5a8c", background:"#060d14", border:"1px solid #1a2f4a", borderRadius:3, padding:"1px 6px" }}>{rec.companyType}</span>}
                        {(() => { const om = orgTypeFor(orgs, rec); return <span title={om && !om.listed ? "Inferred from the AI company type; add it on the Agencies tab to confirm" : ""} style={{ fontSize:9, fontWeight:600, color: om ? "#fbbf24" : "#2a4a6a", background:"#060d14", border:`1px solid ${om ? "#854d0e" : "#1a2f4a"}`, borderRadius:3, padding:"1px 6px" }}>{om ? om.type + (om.listed ? "" : " (auto)") : "Direct"}</span>; })()}
                        {rec.ownership && rec.ownership !== "Unknown" && <span style={{ fontSize:9, fontWeight:600, color:oc.color }}>{rec.ownership}</span>}
                      </div>
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:6, flexShrink:0 }}>
                      {rec.headcount && rec.headcount !== "Unknown" && (
                        <span style={{ fontSize:9, color:"#4a6885", display:"none" }} className="hide-sm">👥 {rec.headcount}</span>
                      )}
                      <span className="badge" style={{ background:rc.bg, borderColor:rc.border, color:rc.text }}>{rec.riskLevel}</span>
                      <span className="badge" style={{ background:rv.color==="#4ade80"?"#0d2b1a":rv.color==="#fbbf24"?"#2b1f0a":"#2b0a0a", borderColor:rv.color==="#4ade80"?"#1a5c35":rv.color==="#fbbf24"?"#854d0e":"#991b1b", color:rv.color }}>{rv.icon} {rec.recommendation}</span>
                      <button
                        onClick={e=>{e.stopPropagation();toggleFav(rec);}}
                        title={isFav(rec.id)?"Remove from Favorites":"Add to Favorites"}
                        style={{ fontSize:14, background:"none", border:"none", cursor:"pointer", color: isFav(rec.id)?"#fbbf24":"#2a4a6a", padding:"0 2px", transition:"color .15s", flexShrink:0 }}
                      >{isFav(rec.id)?"★":"☆"}</button>
                      <span style={{ fontSize:10, color:"#2a4a6a" }}>{isExpanded ? "▲" : "▼"}</span>
                      {confirmDelete === rec.id ? (
                        <div style={{ display:"flex", gap:4, alignItems:"center" }} onClick={e=>e.stopPropagation()}>
                          <span style={{ fontSize:10, color:"#f87171" }}>Delete?</span>
                          <button onClick={e=>{e.stopPropagation();deleteRecord(rec.id);}} style={{ padding:"2px 7px", background:"#2b0a0a", border:"1px solid #7f1d1d", borderRadius:3, color:"#f87171", fontSize:10, fontFamily:"'DM Mono',monospace", cursor:"pointer" }}>Yes</button>
                          <button onClick={e=>{e.stopPropagation();setConfirmDelete(null);}} style={{ padding:"2px 7px", background:"#0d1520", border:"1px solid #1e3a5f", borderRadius:3, color:"#4a6885", fontSize:10, fontFamily:"'DM Mono',monospace", cursor:"pointer" }}>No</button>
                        </div>
                      ) : (
                        <button
                          onClick={e => { e.stopPropagation(); setConfirmDelete(rec.id); }}
                          title="Delete this record"
                          style={{
                            width:22, height:22, borderRadius:4, border:"1px solid",
                            display:"flex", alignItems:"center", justifyContent:"center",
                            fontSize:13, lineHeight:1, cursor:"pointer", flexShrink:0,
                            transition:"all .15s",
                            opacity: hoveredRec === rec.id || isExpanded ? 1 : 0,
                            background: hoveredRec === rec.id ? "#2b0a0a" : "transparent",
                            borderColor: hoveredRec === rec.id ? "#7f1d1d" : "transparent",
                            color: hoveredRec === rec.id ? "#f87171" : "#4a6885",
                          }}
                        >×</button>
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="rec-card-body">
                      {/* Verdict */}
                      <div style={{ fontSize:12, color:"#8aafc8", marginBottom:12, lineHeight:1.5, fontStyle:"italic" }}>"{rec.verdict}"</div>

                      {/* Company Intel Grid */}
                      <div style={{ marginBottom:4 }}>
                        <div style={{ fontSize:9, color:"#2a5a8c", letterSpacing:".12em", textTransform:"uppercase", marginBottom:8 }}>🏢 Company Intelligence</div>
                        <div className="intel-grid">
                          <IntelPill icon="🏢" label="Type"      value={rec.companyType}   />
                          <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                            <div style={{ fontSize:8, color:"#2a5a8c", letterSpacing:".1em", textTransform:"uppercase" }}>📊 Ownership</div>
                            <span style={{ fontSize:11, fontWeight:600, color: oc.color }}>{rec.ownership || "Unknown"}</span>
                          </div>
                          <IntelPill icon="👥" label="Headcount"  value={rec.headcount}     />
                          <IntelPill icon="💰" label="Revenue"    value={rec.annualRevenue}  dim="#86efac" />
                          <IntelPill icon="📅" label="Founded"    value={rec.founded}        />
                          <IntelPill icon="📍" label="HQ"         value={rec.headquarters}   />
                          <IntelPill icon="🌐" label="Website"    value={rec.website}        />
                        </div>
                        {rec.confidenceNote && (
                          <div style={{ fontSize:10, color:"#2a4a6a", fontStyle:"italic", marginTop:6, paddingLeft:4 }}>ℹ {rec.confidenceNote}</div>
                        )}
                      </div>

                      <div className="divider" />

                      {/* Flags */}
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
                        <div>
                          <div style={{ fontSize:9, color:"#7f1d1d", letterSpacing:".12em", textTransform:"uppercase", marginBottom:5 }}>🚩 Red Flags</div>
                          {rec.redFlags?.length ? rec.redFlags.map((f,i)=><div key={i} style={{ fontSize:11, color:"#fca5a5", marginBottom:3, paddingLeft:7, borderLeft:"2px solid #7f1d1d" }}>{f}</div>) : <div style={{ fontSize:11, color:"#2a4a6a" }}>None</div>}
                        </div>
                        <div>
                          <div style={{ fontSize:9, color:"#14532d", letterSpacing:".12em", textTransform:"uppercase", marginBottom:5 }}>✓ Green Flags</div>
                          {rec.greenFlags?.length ? rec.greenFlags.map((f,i)=><div key={i} style={{ fontSize:11, color:"#86efac", marginBottom:3, paddingLeft:7, borderLeft:"2px solid #14532d" }}>{f}</div>) : <div style={{ fontSize:11, color:"#2a4a6a" }}>None</div>}
                        </div>
                      </div>

                      {rec.verificationSteps?.length > 0 && (
                        <>
                          <div style={{ fontSize:9, color:"#2a5a8c", letterSpacing:".12em", textTransform:"uppercase", marginBottom:6 }}>🔍 Verification Steps</div>
                          {rec.verificationSteps.map((s,i)=>(
                            <div key={i} style={{ display:"flex", gap:6, marginBottom:4, alignItems:"flex-start" }}>
                              <div style={{ width:14, height:14, background:"#0f2540", border:"1px solid #1e3a5f", borderRadius:2, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", fontSize:8, color:"#4a9eff", marginTop:1 }}>{i+1}</div>
                              <div style={{ fontSize:11, color:"#8aafc8", lineHeight:1.5 }}>{s}</div>
                            </div>
                          ))}
                        </>
                      )}

                      <div className="divider" />
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                        <div style={{ fontSize:10, color:"#2a4a6a" }}>
                          Vetted {new Date(rec.ts).toLocaleDateString()} {new Date(rec.ts).toLocaleTimeString()}
                          {rec.fromCache && " · cached"}
                        </div>
                        <div style={{ display:"flex", gap:6 }}>
                          <button
                            onClick={() => toggleFav(rec)}
                            style={{ padding:"4px 10px", fontSize:10, background: isFav(rec.id)?"#1a2f0a":"#0d1520", border:"1px solid", borderColor: isFav(rec.id)?"#3a6020":"#1e3a5f", borderRadius:3, color: isFav(rec.id)?"#86efac":"#4a6885", fontFamily:"'DM Mono',monospace", cursor:"pointer", transition:"all .15s" }}
                          >{isFav(rec.id) ? "★ Saved" : "☆ Favorite"}</button>
                          <button className="danger-btn" style={{ padding:"4px 10px", fontSize:10 }} onClick={() => setBL(b=>[...b,{name:rec.company,reason:rec.verdict}])}>+ Blacklist</button>
                          <button className="ghost-btn" style={{ padding:"4px 10px", fontSize:10 }} onClick={() => { setOrgForm({ name:rec.company, url:"", type:ORG_TYPES[0], note:"" }); setShowOrgForm(true); setTab("agencies"); }}>+ Agencies</button>
                          <button className="rm-btn" onClick={() => setConfirmDelete(rec.id)}>Delete</button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ══ FAVORITES TAB ══ */}
        {tab === "favs" && (
          <div className="si">
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14, flexWrap:"wrap", gap:8 }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <span style={{ fontSize:20 }}>★</span>
                <div>
                  <div style={{ fontSize:13, color:"#e2eaf4", fontWeight:600 }}>Favorite Companies</div>
                  <div style={{ fontSize:10, color:"#4a6885" }}>{favs.length} saved · bookmark companies you want to apply to</div>
                </div>
              </div>
              <div style={{ display:"flex", gap:6 }}>
                <button data-testid="export-favorites" className="icon-btn" disabled={favs.length === 0} onClick={() => exportTab("favorites", favs)}>⬇ Export</button>
                <button className="icon-btn" onClick={() => pickTabFile("favorites")}>⬆ Import</button>
                {tabImportInput("favorites")}
              </div>
            </div>
            {exportMsg && <div style={{ fontSize:11, marginBottom:12, color: exportMsg.ok ? "#4ade80" : "#f87171" }}>{exportMsg.text}</div>}

            {favs.length > 0 && (
              <input
                className="field"
                placeholder="Search favorites..."
                value={favSearch}
                onChange={e=>setFavSearch(e.target.value)}
                style={{ marginBottom:12 }}
              />
            )}

            {favs.length === 0 ? (
              <div style={{ textAlign:"center", padding:"56px 0 40px", color:"#2a4a6a" }}>
                <div style={{ fontSize:36, marginBottom:12, opacity:.3 }}>☆</div>
                <div style={{ fontSize:13, marginBottom:6 }}>No favorites yet</div>
                <div style={{ fontSize:11, lineHeight:1.7 }}>
                  After vetting a company, click ☆ Favorite<br/>
                  to save it here for quick reference.
                </div>
              </div>
            ) : (
              favs
                .filter(f => !favSearch || f.company.toLowerCase().includes(favSearch.toLowerCase()) || (f.role||"").toLowerCase().includes(favSearch.toLowerCase()))
                .map(fav => {
                  const rc = RISK[fav.riskLevel] || RISK.LOW;
                  const rv = REC[fav.recommendation] || REC.APPLY;
                  const oc = OWN_COLORS[fav.ownership] || OWN_COLORS.Unknown;
                  const isExp = expandedFav === fav.id;
                  return (
                    <div key={fav.id} className="rec-card" style={{ borderColor: isExp ? "#fbbf24" : "#1a2f0a" }}>
                      <div className="rec-card-header" onClick={() => setExpandedFav(isExp ? null : fav.id)}>
                        <div style={{ width:3, height:40, background:"#fbbf24", borderRadius:2, flexShrink:0 }} />
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                            <span style={{ fontSize:14, color:"#fbbf24" }}>★</span>
                            <span style={{ fontSize:13, color:"#e2eaf4", fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{fav.company}</span>
                          </div>
                          <div style={{ display:"flex", gap:8, alignItems:"center", marginTop:2, flexWrap:"wrap" }}>
                            {fav.role && <span style={{ fontSize:10, color:"#4a6885" }}>{fav.role}</span>}
                            {fav.companyType && fav.companyType !== "Unknown" && <span style={{ fontSize:9, color:"#2a5a8c", background:"#060d14", border:"1px solid #1a2f4a", borderRadius:3, padding:"1px 6px" }}>{fav.companyType}</span>}
                            {fav.ownership && fav.ownership !== "Unknown" && <span style={{ fontSize:9, fontWeight:600, color:oc.color }}>{fav.ownership}</span>}
                          </div>
                        </div>
                        <div style={{ display:"flex", alignItems:"center", gap:6, flexShrink:0 }}>
                          <span className="badge" style={{ background:rc.bg, borderColor:rc.border, color:rc.text }}>{fav.riskLevel}</span>
                          <span className="badge" style={{ background:rv.color==="#4ade80"?"#0d2b1a":rv.color==="#fbbf24"?"#2b1f0a":"#2b0a0a", borderColor:rv.color==="#4ade80"?"#1a5c35":rv.color==="#fbbf24"?"#854d0e":"#991b1b", color:rv.color }}>{rv.icon} {fav.recommendation}</span>
                          <span style={{ fontSize:10, color:"#2a4a6a" }}>{isExp ? "▲" : "▼"}</span>
                        </div>
                      </div>

                      {isExp && (
                        <div className="rec-card-body">
                          <div style={{ fontSize:12, color:"#8aafc8", marginBottom:12, lineHeight:1.5, fontStyle:"italic" }}>"{fav.verdict}"</div>

                          {/* Company Intel */}
                          <div style={{ marginBottom:4 }}>
                            <div style={{ fontSize:9, color:"#2a5a8c", letterSpacing:".12em", textTransform:"uppercase", marginBottom:8 }}>🏢 Company Intelligence</div>
                            <div className="intel-grid">
                              <IntelPill icon="🏢" label="Type"     value={fav.companyType}  />
                              <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                                <div style={{ fontSize:8, color:"#2a5a8c", letterSpacing:".1em", textTransform:"uppercase" }}>📊 Ownership</div>
                                <span style={{ fontSize:11, fontWeight:600, color:oc.color }}>{fav.ownership||"Unknown"}</span>
                              </div>
                              <IntelPill icon="👥" label="Headcount" value={fav.headcount}    />
                              <IntelPill icon="💰" label="Revenue"   value={fav.annualRevenue} dim="#86efac" />
                              <IntelPill icon="📅" label="Founded"   value={fav.founded}      />
                              <IntelPill icon="📍" label="HQ"        value={fav.headquarters} />
                              <IntelPill icon="🌐" label="Website"   value={fav.website}      />
                            </div>
                            {fav.confidenceNote && <div style={{ fontSize:10, color:"#2a4a6a", fontStyle:"italic", marginTop:6, paddingLeft:4 }}>ℹ {fav.confidenceNote}</div>}
                          </div>

                          <div className="divider" />

                          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
                            <div>
                              <div style={{ fontSize:9, color:"#7f1d1d", letterSpacing:".12em", textTransform:"uppercase", marginBottom:5 }}>🚩 Red Flags</div>
                              {fav.redFlags?.length ? fav.redFlags.map((f,i)=><div key={i} style={{ fontSize:11, color:"#fca5a5", marginBottom:3, paddingLeft:7, borderLeft:"2px solid #7f1d1d" }}>{f}</div>) : <div style={{ fontSize:11, color:"#2a4a6a" }}>None</div>}
                            </div>
                            <div>
                              <div style={{ fontSize:9, color:"#14532d", letterSpacing:".12em", textTransform:"uppercase", marginBottom:5 }}>✓ Green Flags</div>
                              {fav.greenFlags?.length ? fav.greenFlags.map((f,i)=><div key={i} style={{ fontSize:11, color:"#86efac", marginBottom:3, paddingLeft:7, borderLeft:"2px solid #14532d" }}>{f}</div>) : <div style={{ fontSize:11, color:"#2a4a6a" }}>None</div>}
                            </div>
                          </div>

                          {fav.verificationSteps?.length > 0 && (
                            <>
                              <div style={{ fontSize:9, color:"#2a5a8c", letterSpacing:".12em", textTransform:"uppercase", marginBottom:6 }}>🔍 Verification Steps</div>
                              {fav.verificationSteps.map((s,i)=>(
                                <div key={i} style={{ display:"flex", gap:6, marginBottom:4, alignItems:"flex-start" }}>
                                  <div style={{ width:14, height:14, background:"#0f2540", border:"1px solid #1e3a5f", borderRadius:2, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", fontSize:8, color:"#4a9eff", marginTop:1 }}>{i+1}</div>
                                  <div style={{ fontSize:11, color:"#8aafc8", lineHeight:1.5 }}>{s}</div>
                                </div>
                              ))}
                            </>
                          )}

                          <div className="divider" />
                          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                            <div style={{ fontSize:10, color:"#2a4a6a" }}>
                              Favorited {new Date(fav.favoritedAt||fav.ts).toLocaleDateString()}
                            </div>
                            <div style={{ display:"flex", gap:6 }}>
                              {confirmRemoveFav === fav.id ? (
                                <div style={{ display:"flex", gap:4, alignItems:"center" }}>
                                  <span style={{ fontSize:10, color:"#f87171" }}>Remove?</span>
                                  <button onClick={()=>removeFav(fav.id)} style={{ padding:"2px 7px", background:"#2b0a0a", border:"1px solid #7f1d1d", borderRadius:3, color:"#f87171", fontSize:10, fontFamily:"'DM Mono',monospace", cursor:"pointer" }}>Yes</button>
                                  <button onClick={()=>setConfirmRemoveFav(null)} style={{ padding:"2px 7px", background:"#0d1520", border:"1px solid #1e3a5f", borderRadius:3, color:"#4a6885", fontSize:10, fontFamily:"'DM Mono',monospace", cursor:"pointer" }}>No</button>
                                </div>
                              ) : (
                                <button onClick={()=>setConfirmRemoveFav(fav.id)} style={{ padding:"4px 10px", background:"#2b1f0a", border:"1px solid #854d0e", borderRadius:3, color:"#fbbf24", fontSize:10, fontFamily:"'DM Mono',monospace", cursor:"pointer" }}>★ Remove</button>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
            )}
          </div>
        )}

        {/* ══ AGENCIES TAB ══ */}
        {tab === "agencies" && (
          <div className="si">
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14, flexWrap:"wrap", gap:8 }}>
              <div style={{ fontSize:11, color:"#4a6885" }}>{orgs.length} staffing / consulting firms listed</div>
              <div style={{ display:"flex", gap:6 }}>
                <button className="ghost-btn" onClick={scanRecordsForOrgs}>↻ Scan Records</button>
                <button data-testid="export-agencies" className="ghost-btn" disabled={orgs.length === 0} onClick={() => exportTab("agencies", orgs)}>⬇ Export</button>
                <button className="ghost-btn" onClick={() => pickTabFile("agencies")}>⬆ Import</button>
                {tabImportInput("agencies")}
                <button className="ghost-btn" onClick={() => setShowOrgForm(v=>!v)}>{showOrgForm ? "✕ Cancel" : "+ Add"}</button>
              </div>
            </div>
            <div style={{ fontSize:11, color:"#2a5a8c", lineHeight:1.6, marginBottom:12 }}>
              Mark firms that are recruiters or IT consultancies rather than direct employers. Records matching a name or website here show the firm type, and you can filter Records by it.
            </div>
            {exportMsg && <div style={{ fontSize:11, marginBottom:12, color: exportMsg.ok ? "#4ade80" : "#f87171" }}>{exportMsg.text}</div>}
            {showOrgForm && (
              <div className="si" style={{ background:"#0a1520", border:"1px solid #1e3a5f", borderRadius:6, padding:14, marginBottom:14 }}>
                <input className="field" placeholder="Company name" value={orgForm.name} onChange={e => setOrgForm(f => ({ ...f, name:e.target.value }))} />
                <input className="field" placeholder="Website (optional) e.g. https://example.com" value={orgForm.url} onChange={e => setOrgForm(f => ({ ...f, url:e.target.value }))} />
                <select className="sel" style={{ marginBottom:10 }} value={orgForm.type} onChange={e => setOrgForm(f => ({ ...f, type:e.target.value }))}>
                  {ORG_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <input className="field" placeholder="Note (optional)" value={orgForm.note} onChange={e => setOrgForm(f => ({ ...f, note:e.target.value }))} />
                <button className="primary-btn" disabled={!orgForm.name.trim()} onClick={addOrg}>Save</button>
              </div>
            )}
            {orgs.length === 0
              ? <div style={{ textAlign:"center", padding:"40px 0", color:"#2a4a6a", fontSize:12 }}>No firms listed yet</div>
              : orgs.map((e,i) => (
                <div key={i} className="bl-row">
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, color:"#e2eaf4", fontWeight:500, marginBottom:2 }}>🏢 {e.name}</div>
                    <div style={{ fontSize:11, color:"#4a6885", lineHeight:1.4 }}>{e.url}{e.url && e.note ? " · " : ""}{e.note}</div>
                  </div>
                  <select className="sel" value={e.type} onChange={ev => setOrgs(cur => cur.map((x,j) => j===i ? { ...x, type:ev.target.value } : x))}>
                    {ORG_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <button className="rm-btn" onClick={() => setOrgs(cur => cur.filter((_,j) => j!==i))}>Remove</button>
                </div>
              ))
            }
          </div>
        )}

        {/* ══ BLACKLIST TAB ══ */}
        {tab === "blacklist" && (
          <div className="si">
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
              <div style={{ fontSize:11, color:"#4a6885" }}>{blacklist.length} companies flagged</div>
              <div style={{ display:"flex", gap:6 }}>
                <button data-testid="export-blacklist" className="ghost-btn" onClick={() => exportTab("blacklist", blacklist)}>⬇ Export</button>
                <button className="ghost-btn" onClick={() => pickTabFile("blacklist")}>⬆ Import</button>
                {tabImportInput("blacklist")}
                <button className="ghost-btn" onClick={() => setShowAddForm(v=>!v)}>{showAddForm ? "✕ Cancel" : "+ Add Manually"}</button>
              </div>
            </div>
            {blReset && (
              <div style={{ background:"#2b1f0a", border:"1px solid #854d0e", borderRadius:6, padding:"10px 12px", marginBottom:14, fontSize:11, color:"#fbbf24", lineHeight:1.5 }}>
                ⚠ No saved blacklist was found in this browser, so the default list is showing. If you had your own entries, click Import and choose your jobguard-blacklist.json backup.
                <button className="rm-btn" style={{ marginLeft:8 }} onClick={() => setBlReset(false)}>Dismiss</button>
              </div>
            )}
            {exportMsg && (
              <div style={{ fontSize:11, marginBottom:14, color: exportMsg.ok ? "#4ade80" : "#f87171" }}>{exportMsg.text}</div>
            )}
            {showAddForm && (
              <div className="si" style={{ background:"#0a1520", border:"1px solid #1e3a5f", borderRadius:6, padding:14, marginBottom:14 }}>
                <input className="field" placeholder="Company name" value={newEntry.name} onChange={e=>setNewEntry(n=>({...n,name:e.target.value}))} />
                <input className="field" placeholder="Reason (optional)" value={newEntry.reason} onChange={e=>setNewEntry(n=>({...n,reason:e.target.value}))} />
                <button className="danger-btn" disabled={!newEntry.name.trim()} onClick={() => { if(!newEntry.name.trim())return; setBL(b=>[...b,{name:newEntry.name.trim(),reason:newEntry.reason.trim()||"Manually flagged"}]); setNewEntry({name:"",reason:""}); setShowAddForm(false); }}>🚫 Add to Blacklist</button>
              </div>
            )}
            {blacklist.length === 0
              ? <div style={{ textAlign:"center", padding:"40px 0", color:"#2a4a6a", fontSize:12 }}>No companies blacklisted yet</div>
              : blacklist.map((e,i) => (
                <div key={i} className="bl-row">
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, color:"#fca5a5", fontWeight:500, marginBottom:2 }}>🚫 {e.name}</div>
                    <div style={{ fontSize:11, color:"#4a6885", lineHeight:1.4 }}>{e.reason}</div>
                  </div>
                  <button className="rm-btn" onClick={() => setBL(b=>b.filter((_,j)=>j!==i))}>Remove</button>
                </div>
              ))
            }
          </div>
        )}

        {/* ══ SETTINGS TAB ══ */}
        {tab === "settings" && (
          <div className="si">
            <div style={{ background:"#0a1218", border:"1px solid #1a2f4a", borderRadius:8, padding:"16px 18px", marginBottom:14 }}>
              <div style={{ fontSize:11, color:"#4a9eff", letterSpacing:".1em", textTransform:"uppercase", marginBottom:10 }}>Choose Backup/Export Folder</div>
              {!fsSupported ? (
                <div style={{ fontSize:11, color:"#fbbf24", lineHeight:1.6 }}>This browser cannot write to a chosen folder. Use Chrome or Edge. Exports will download normally.</div>
              ) : (
                <>
                  <div style={{ fontSize:12, color: dirState==="ready" ? "#4ade80" : "#8aafc8", marginBottom:10 }}>
                    {dirState==="ready" && <>✓ Saving to folder: <b>{dirName}</b></>}
                    {dirState==="needs-permission" && <>Folder <b>{dirName}</b> needs permission again this session.</>}
                    {dirState==="none" && <>No folder set. Exports go to your Downloads folder.</>}
                  </div>
                  <div style={{ display:"flex", gap:8, marginBottom:10 }}>
                    {dirState==="needs-permission" && <button className="primary-btn" style={{ flex:2 }} onClick={reconnectFolder}>Reconnect</button>}
                    <button className="ghost-btn" style={{ flex:1 }} onClick={chooseFolder}>{dirState==="none" ? "Choose Backup/Export Folder" : "Change Backup/Export Folder"}</button>
                    {dirState!=="none" && <button className="ghost-btn" style={{ flex:1 }} onClick={forgetFolder}>Clear</button>}
                  </div>
                  <div style={{ display:"flex", gap:8, marginBottom:10 }}>
                    <button data-testid="export-all" className="ghost-btn" style={{ flex:1 }} onClick={() => exportAllRecords(blacklist, records, favs, orgs)}>⬇ Export/Backup All</button>
                    <button className="ghost-btn" style={{ flex:1 }} onClick={() => restoreRef.current && restoreRef.current.click()}>⬆ Restore from file</button>
                    {dirState==="ready" && <button className="ghost-btn" style={{ flex:1 }} onClick={restoreFromFolder}>Restore from folder</button>}
                  </div>
                  <div style={{ fontSize:11, color:"#2a5a8c", lineHeight:1.7 }}>
                    Pick a folder OUTSIDE the project (for example 006_My-JobGuard-Data). Blacklist, records and favorites auto-save there as jobguard-all-records.json on every change; Restore merges a backup into the app without deleting anything. Chrome may ask you to Reconnect after a restart. Clearing Chrome site data wipes the in-browser copy, so keep this folder.
                  </div>
                </>
              )}
              {exportMsg && <div style={{ marginTop:8, fontSize:11, color: exportMsg.ok ? "#4ade80" : "#f87171" }}>{exportMsg.text}</div>}
            </div>
            <div style={{ background:"#0a1218", border:"1px solid #1a2f4a", borderRadius:8, padding:"16px 18px", marginBottom:14 }}>
              <div style={{ fontSize:11, color:"#4a9eff", letterSpacing:".1em", textTransform:"uppercase", marginBottom:10 }}>Anthropic API Key</div>
              <input className="field" type="password" placeholder="sk-ant-api03-..." value={apiKey} onChange={e=>{setApiKey(e.target.value);setTestMsg(null);}} />
              <div style={{ display:"flex", gap:8, marginBottom:10 }}>
                <button className="primary-btn" style={{ flex:2 }} onClick={() => { saveKey(apiKey); setKeySaved(true); setTimeout(()=>setKeySaved(false),2000); }}>{keySaved ? "✓ Saved!" : "Save Key"}</button>
                <button className="ghost-btn" style={{ flex:1 }} onClick={handleTestKey} disabled={testing}>{testing ? <><span className="spin"/>Testing...</> : "Test Key"}</button>
              </div>
              {testMsg && (
                <div style={{ padding:"9px 11px", borderRadius:5, background:testMsg.ok?"#0d2b1a":"#1a0a0a", border:`1px solid ${testMsg.ok?"#1a5c35":"#7f1d1d"}`, fontSize:12, color:testMsg.ok?"#4ade80":"#f87171" }}>{testMsg.text}</div>
              )}
              <div style={{ marginTop:10, fontSize:11, color:"#2a5a8c", lineHeight:1.7 }}>
                Get your key at <a href="https://console.anthropic.com" target="_blank" rel="noreferrer" style={{ color:"#4a9eff" }}>console.anthropic.com</a><br/>
                Stored in your browser only — never sent anywhere except the Anthropic API.
              </div>
            </div>
            <div style={{ background:"#0a1218", border:"1px solid #1a2f4a", borderRadius:8, padding:"14px 18px" }}>
              <div style={{ fontSize:11, color:"#4a9eff", letterSpacing:".1em", textTransform:"uppercase", marginBottom:8 }}>Status</div>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <div style={{ width:8, height:8, borderRadius:"50%", background: apiKey ? "#4ade80" : "#f87171" }} />
                <div style={{ fontSize:12, color:"#4a6885" }}>{apiKey ? (apiKey.startsWith("sk-") ? "API key set — ready to vet" : 'Key format wrong (should start with "sk-ant-")') : "No API key — add one above"}</div>
              </div>
            </div>
          </div>
        )}

      </div>
      <div style={{ textAlign:"center", padding:"12px 0 24px", fontSize:9, color:"#1a2f4a", letterSpacing:".12em" }}>JOBGUARD · AI-POWERED · DATA STORED LOCALLY</div>
    </div>
  );
}