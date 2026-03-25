/**
 * Dual-mode storage module: Supabase (when configured) or filesystem fallback.
 *
 * Set SUPABASE_URL and SUPABASE_KEY env vars to enable Supabase mode.
 * Without them, all operations fall back to the existing file-based logic.
 */

const fs = require('fs');
const path = require('path');

// Lazy-loaded Supabase client
let supabase = null;
let mode = 'fs'; // 'supabase' | 'fs'

// File-system paths (used only in fs mode)
const GALAXIES_DIR = path.join(__dirname, 'data', 'galaxies');
const LEADERBOARDS_DIR = path.join(__dirname, 'data', 'leaderboards');
const LOG_DIR = path.join(__dirname, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'llm.jsonl');

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------

async function initStorage() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;

  if (url && key) {
    try {
      const { createClient } = require('@supabase/supabase-js');
      supabase = createClient(url, key);

      // Verify connectivity by touching each table
      const checks = await Promise.allSettled([
        supabase.from('galaxies').select('galaxy_id').limit(1),
        supabase.from('leaderboard_entries').select('id').limit(1),
        supabase.from('llm_logs').select('id').limit(1),
      ]);

      const failed = checks.filter((c) => c.status === 'rejected' || c.value?.error);
      if (failed.length > 0) {
        console.warn('[Storage] Supabase table probes failed — falling back to filesystem.');
        console.warn('[Storage] Run supabase-schema.sql in the Supabase SQL Editor to fix this.');
        for (const c of failed) {
          const err = c.status === 'rejected' ? c.reason : c.value?.error?.message;
          if (err) console.warn('[Storage]  -', err);
        }
        supabase = null;
        mode = 'fs';
        ensureFsDirs();
        console.log('[Storage] Using filesystem backend (Supabase fallback)');
      } else {
        mode = 'supabase';
        console.log('[Storage] Using Supabase backend');
      }
    } catch (err) {
      console.error(
        '[Storage] Failed to initialise Supabase, falling back to filesystem:',
        err.message,
      );
      supabase = null;
      mode = 'fs';
      ensureFsDirs();
    }
  } else {
    mode = 'fs';
    ensureFsDirs();
    console.log('[Storage] Using filesystem backend (no SUPABASE_URL/SUPABASE_KEY)');
  }
}

function ensureFsDirs() {
  fs.mkdirSync(GALAXIES_DIR, { recursive: true });
  fs.mkdirSync(LEADERBOARDS_DIR, { recursive: true });
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function getMode() {
  return mode;
}

// ---------------------------------------------------------------------------
// Galaxy functions
// ---------------------------------------------------------------------------

async function loadCurrentGalaxy() {
  if (mode === 'supabase') {
    try {
      const { data, error } = await supabase
        .from('galaxies')
        .select('*')
        .eq('is_current', true)
        .maybeSingle();
      if (error || !data) return null;
      // Check expiry
      if (new Date(data.expires_at) <= new Date()) return null;
      // Map DB columns to the JS shape the rest of the app expects
      return dbGalaxyToJs(data);
    } catch (err) {
      console.error('[Storage] loadCurrentGalaxy error:', err.message);
      return null;
    }
  }

  // --- FS fallback ---
  try {
    const pointerPath = path.join(GALAXIES_DIR, 'current.json');
    if (!fs.existsSync(pointerPath)) return null;
    const pointer = JSON.parse(fs.readFileSync(pointerPath, 'utf-8'));
    const galaxyPath = path.join(GALAXIES_DIR, `${pointer.galaxyId}.json`);
    if (!fs.existsSync(galaxyPath)) return null;
    const galaxy = JSON.parse(fs.readFileSync(galaxyPath, 'utf-8'));
    if (new Date(galaxy.expiresAt) <= new Date()) return null;
    return galaxy;
  } catch (e) {
    console.error('[Galaxy] Failed to load current galaxy:', e.message);
    return null;
  }
}

async function saveGalaxy(galaxy) {
  if (mode === 'supabase') {
    try {
      // Mark all existing galaxies as not current
      await supabase.from('galaxies').update({ is_current: false }).eq('is_current', true);

      // Insert the new galaxy as current
      const row = jsGalaxyToDb(galaxy);
      row.is_current = true;
      const { error } = await supabase.from('galaxies').upsert(row, { onConflict: 'galaxy_id' });
      if (error) console.error('[Storage] saveGalaxy error:', error.message);
      else
        console.log(
          `[Galaxy] Saved galaxy "${galaxy.name}" (${galaxy.planets.length} planets), expires ${galaxy.expiresAt}`,
        );
    } catch (err) {
      console.error('[Storage] saveGalaxy error:', err.message);
    }
    return;
  }

  // --- FS fallback ---
  const galaxyPath = path.join(GALAXIES_DIR, `${galaxy.galaxyId}.json`);
  fs.writeFileSync(galaxyPath, JSON.stringify(galaxy, null, 2));
  const pointerPath = path.join(GALAXIES_DIR, 'current.json');
  fs.writeFileSync(pointerPath, JSON.stringify({ galaxyId: galaxy.galaxyId, path: galaxyPath }));
  console.log(
    `[Galaxy] Saved galaxy "${galaxy.name}" (${galaxy.planets.length} planets), expires ${galaxy.expiresAt}`,
  );
}

async function listGalaxyHistory() {
  if (mode === 'supabase') {
    try {
      const { data, error } = await supabase
        .from('galaxies')
        .select('galaxy_id, name, created_at, planets')
        .order('created_at', { ascending: false });
      if (error) {
        console.error('[Storage] listGalaxyHistory error:', error.message);
        return [];
      }
      return (data || []).map((g) => ({
        galaxyId: g.galaxy_id,
        name: g.name,
        createdAt: g.created_at,
        planetCount: Array.isArray(g.planets) ? g.planets.length : 0,
      }));
    } catch (err) {
      console.error('[Storage] listGalaxyHistory error:', err.message);
      return [];
    }
  }

  // --- FS fallback ---
  try {
    const files = fs
      .readdirSync(GALAXIES_DIR)
      .filter((f) => f !== 'current.json' && f.endsWith('.json'));
    return files
      .map((f) => {
        try {
          const g = JSON.parse(fs.readFileSync(path.join(GALAXIES_DIR, f), 'utf-8'));
          return {
            galaxyId: g.galaxyId,
            name: g.name,
            createdAt: g.createdAt,
            planetCount: g.planets?.length || 0,
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } catch {
    return [];
  }
}

async function collectUsedPlanetNames() {
  if (mode === 'supabase') {
    try {
      const { data, error } = await supabase.from('galaxies').select('planets');
      if (error) {
        console.error('[Storage] collectUsedPlanetNames error:', error.message);
        return [];
      }
      const names = new Set();
      for (const row of data || []) {
        if (Array.isArray(row.planets)) {
          row.planets.forEach((p) => names.add(p.name));
        }
      }
      return [...names];
    } catch (err) {
      console.error('[Storage] collectUsedPlanetNames error:', err.message);
      return [];
    }
  }

  // --- FS fallback ---
  try {
    const files = fs
      .readdirSync(GALAXIES_DIR)
      .filter((f) => f !== 'current.json' && f.endsWith('.json'));
    const names = new Set();
    for (const f of files) {
      try {
        const g = JSON.parse(fs.readFileSync(path.join(GALAXIES_DIR, f), 'utf-8'));
        if (g.planets) g.planets.forEach((p) => names.add(p.name));
      } catch {}
    }
    return [...names];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Leaderboard functions
// ---------------------------------------------------------------------------

async function loadLeaderboard(galaxyId, opts) {
  const excludeTourist = opts?.excludeTourist || false;

  if (mode === 'supabase') {
    try {
      let query = supabase.from('leaderboard_entries').select('*').eq('galaxy_id', galaxyId);
      if (excludeTourist) query = query.or('human_tourist.is.null,human_tourist.eq.false');
      query = query
        .order('highest_stage', { ascending: false })
        .order('time_ms', { ascending: true })
        .limit(100);
      const { data, error } = await query;
      if (error) {
        console.error('[Storage] loadLeaderboard error:', error.message);
        return [];
      }
      return (data || []).map(dbEntryToJs);
    } catch (err) {
      console.error('[Storage] loadLeaderboard error:', err.message);
      return [];
    }
  }

  // --- FS fallback ---
  const lbPath = path.join(LEADERBOARDS_DIR, `${galaxyId}.json`);
  try {
    if (fs.existsSync(lbPath)) {
      let entries = JSON.parse(fs.readFileSync(lbPath, 'utf-8'));
      if (excludeTourist) entries = entries.filter((e) => !e.humanTourist);
      return entries;
    }
    return [];
  } catch {
    return [];
  }
}

async function saveLeaderboardEntry(galaxyId, entry) {
  if (mode === 'supabase') {
    try {
      // Check for existing entry (.maybeSingle returns null without error when 0 rows)
      const { data: existing, error: lookupErr } = await supabase
        .from('leaderboard_entries')
        .select('*')
        .eq('galaxy_id', galaxyId)
        .eq('player_id', entry.playerId)
        .maybeSingle();
      if (lookupErr) {
        console.error('[Storage] Leaderboard lookup error:', lookupErr.message);
      }

      const row = {
        galaxy_id: galaxyId,
        player_id: entry.playerId,
        player_name: entry.playerName,
        highest_stage: entry.highestStage,
        total_jumps: entry.totalJumps,
        time_ms: entry.timeMs,
        human_tourist: entry.humanTourist,
        submitted_at: entry.submittedAt,
      };

      if (existing) {
        // Only update score fields if it's a new best
        if (entry.highestStage > existing.highest_stage) {
          row.highest_stage = entry.highestStage;
          row.total_jumps = entry.totalJumps;
          row.time_ms = entry.timeMs;
          row.human_tourist = entry.humanTourist;
        } else {
          row.highest_stage = existing.highest_stage;
          row.total_jumps = existing.total_jumps;
          row.time_ms = existing.time_ms;
          row.human_tourist = existing.human_tourist;
        }
        // Always update name and timestamp
        row.player_name = entry.playerName;
        row.submitted_at = entry.submittedAt;
      }

      await supabase.from('leaderboard_entries').upsert(row, { onConflict: 'galaxy_id,player_id' });

      // Compute rank
      const { count } = await supabase
        .from('leaderboard_entries')
        .select('*', { count: 'exact', head: true })
        .eq('galaxy_id', galaxyId)
        .or(
          `highest_stage.gt.${row.highest_stage},and(highest_stage.eq.${row.highest_stage},time_ms.lt.${row.time_ms})`,
        );

      return { rank: (count || 0) + 1 };
    } catch (err) {
      console.error('[Storage] saveLeaderboardEntry error:', err.message);
      return { rank: 1 };
    }
  }

  // --- FS fallback ---
  const lbPath = path.join(LEADERBOARDS_DIR, `${galaxyId}.json`);
  let entries = [];
  try {
    if (fs.existsSync(lbPath)) entries = JSON.parse(fs.readFileSync(lbPath, 'utf-8'));
  } catch {}

  const existingIdx = entries.findIndex((e) => e.playerId === entry.playerId);
  if (existingIdx >= 0) {
    entries[existingIdx].playerName = entry.playerName;
    entries[existingIdx].submittedAt = entry.submittedAt;
    if (entry.highestStage > entries[existingIdx].highestStage) {
      entries[existingIdx].highestStage = entry.highestStage;
      entries[existingIdx].totalJumps = entry.totalJumps;
      entries[existingIdx].timeMs = entry.timeMs;
      entries[existingIdx].humanTourist = entry.humanTourist;
    }
  } else {
    entries.push(entry);
  }

  entries.sort((a, b) => b.highestStage - a.highestStage || a.timeMs - b.timeMs);
  entries = entries.slice(0, 100);

  try {
    fs.writeFileSync(lbPath, JSON.stringify(entries, null, 2));
  } catch {}

  return { rank: entries.findIndex((e) => e.playerId === entry.playerId) + 1 };
}

async function aggregateLeaderboard(opts) {
  const humanTouristOnly = opts?.humanTouristOnly || false;
  const excludeTourist = opts?.excludeTourist || false;

  if (mode === 'supabase') {
    try {
      // Get all leaderboard entries, optionally filtered
      let query = supabase
        .from('leaderboard_entries')
        .select(
          'player_id, player_name, highest_stage, time_ms, galaxy_id, submitted_at, human_tourist',
        );
      if (humanTouristOnly) query = query.eq('human_tourist', true);
      else if (excludeTourist) query = query.or('human_tourist.is.null,human_tourist.eq.false');

      const { data: entries, error: entriesErr } = await query;
      if (entriesErr) {
        console.error('[Storage] aggregateLeaderboard entries error:', entriesErr.message);
        return [];
      }

      // Get galaxy names
      const { data: galaxies } = await supabase
        .from('galaxies')
        .select('galaxy_id, name, created_at');
      const galaxyMap = {};
      for (const g of galaxies || []) galaxyMap[g.galaxy_id] = g;

      // Return all per-galaxy records (one per player per galaxy)
      const allRecords = [];
      for (const e of entries || []) {
        const galaxy = galaxyMap[e.galaxy_id] || { name: 'Unknown', created_at: null };
        allRecords.push({
          playerName: e.player_name,
          highestStage: e.highest_stage,
          galaxyName: galaxy.name,
          galaxyId: e.galaxy_id,
          date: e.submitted_at || galaxy.created_at,
        });
      }

      return allRecords
        .sort((a, b) => b.highestStage - a.highestStage || (a.date > b.date ? -1 : 1))
        .slice(0, 100);
    } catch (err) {
      console.error('[Storage] aggregateLeaderboard error:', err.message);
      return [];
    }
  }

  // --- FS fallback ---
  const filterFn = humanTouristOnly
    ? (e) => e.humanTourist
    : excludeTourist
      ? (e) => !e.humanTourist
      : null;
  const files = fs.readdirSync(LEADERBOARDS_DIR).filter((f) => f.endsWith('.json'));
  const galaxies = await listGalaxyHistory();
  const galaxyMap = {};
  for (const g of galaxies) galaxyMap[g.galaxyId] = g;

  const allRecords = [];
  for (const file of files) {
    const galaxyId = file.replace('.json', '');
    const galaxy = galaxyMap[galaxyId] || { name: 'Unknown', createdAt: null };
    try {
      const entries = JSON.parse(fs.readFileSync(path.join(LEADERBOARDS_DIR, file), 'utf-8'));
      for (const e of entries) {
        if (filterFn && !filterFn(e)) continue;
        allRecords.push({
          playerName: e.playerName,
          highestStage: e.highestStage,
          galaxyName: galaxy.name,
          galaxyId,
          date: e.submittedAt || galaxy.createdAt,
        });
      }
    } catch {}
  }

  return allRecords
    .sort((a, b) => b.highestStage - a.highestStage || (a.date > b.date ? -1 : 1))
    .slice(0, 100);
}

async function loadLeaderboardHistory(opts) {
  const excludeTourist = opts?.excludeTourist || false;

  if (mode === 'supabase') {
    try {
      const galaxies = await listGalaxyHistory();
      const result = [];
      for (const g of galaxies) {
        let query = supabase.from('leaderboard_entries').select('*').eq('galaxy_id', g.galaxyId);
        if (excludeTourist) query = query.or('human_tourist.is.null,human_tourist.eq.false');
        query = query
          .order('highest_stage', { ascending: false })
          .order('time_ms', { ascending: true })
          .limit(10);
        const { data } = await query;
        result.push({ ...g, entries: (data || []).map(dbEntryToJs) });
      }
      return result;
    } catch (err) {
      console.error('[Storage] loadLeaderboardHistory error:', err.message);
      return [];
    }
  }

  // --- FS fallback ---
  const galaxies = await listGalaxyHistory();
  return galaxies.map((g) => {
    const lbPath = path.join(LEADERBOARDS_DIR, `${g.galaxyId}.json`);
    let entries = [];
    try {
      if (fs.existsSync(lbPath)) {
        entries = JSON.parse(fs.readFileSync(lbPath, 'utf-8'));
        if (excludeTourist) entries = entries.filter((e) => !e.humanTourist);
        entries = entries.slice(0, 10);
      }
    } catch {}
    return { ...g, entries };
  });
}

// ---------------------------------------------------------------------------
// Log functions
// ---------------------------------------------------------------------------

function appendLog(entry) {
  if (mode === 'supabase') {
    // Fire-and-forget: insert into llm_logs, do not await
    const row = {
      stage: entry.stage != null ? String(entry.stage) : null,
      input: entry.input || null,
      response: entry.response || null,
      latency_ms: entry.latencyMs || null,
      error: entry.error || null,
      model: entry.model || null,
      created_at: entry.timestamp || new Date().toISOString(),
    };
    supabase
      .from('llm_logs')
      .insert(row)
      .then(({ error }) => {
        if (error) console.error('[Storage] appendLog error:', error.message);
      })
      .catch((err) => {
        console.error('[Storage] appendLog error:', err.message);
      });
    return;
  }

  // --- FS fallback ---
  try {
    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
  } catch {}
}

function clearLogs() {
  if (mode === 'supabase') {
    // Fire-and-forget truncation — delete all rows
    supabase
      .from('llm_logs')
      .delete()
      .neq('id', 0)
      .then(({ error }) => {
        if (error) console.error('[Storage] clearLogs error:', error.message);
      })
      .catch((err) => {
        console.error('[Storage] clearLogs error:', err.message);
      });
    return;
  }

  // --- FS fallback ---
  try {
    fs.writeFileSync(LOG_FILE, '');
  } catch {}
}

// ---------------------------------------------------------------------------
// DB ↔ JS conversion helpers
// ---------------------------------------------------------------------------

function dbGalaxyToJs(row) {
  return {
    galaxyId: row.galaxy_id,
    name: row.name,
    planets: row.planets,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

function jsGalaxyToDb(galaxy) {
  return {
    galaxy_id: galaxy.galaxyId,
    name: galaxy.name,
    planets: galaxy.planets,
    created_at: galaxy.createdAt,
    expires_at: galaxy.expiresAt,
  };
}

function dbEntryToJs(row) {
  return {
    playerId: row.player_id,
    playerName: row.player_name,
    highestStage: row.highest_stage,
    totalJumps: row.total_jumps,
    timeMs: row.time_ms,
    humanTourist: row.human_tourist,
    submittedAt: row.submitted_at,
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  initStorage,
  getMode,
  loadCurrentGalaxy,
  saveGalaxy,
  listGalaxyHistory,
  collectUsedPlanetNames,
  loadLeaderboard,
  saveLeaderboardEntry,
  aggregateLeaderboard,
  loadLeaderboardHistory,
  appendLog,
  clearLogs,
};
