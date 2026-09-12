/**
 * @file hashChain.js
 * @description Pure cryptographic tamper-evident Hash Chain for immutable audit logs:
 * 1. SHA-256 deterministic hash chaining
 * 2. Genesis block linking with 64-zero seed
 * 3. Canonical payload serialization
 * 4. End-to-end chain verification and tamper detection.
 * Zero external dependencies (uses Node.js built-in crypto).
 */

const crypto = require('crypto');

const GENESIS_HASH = '0'.repeat(64);

/**
 * Deterministically stringifies payload with sorted keys.
 * @param {any} obj
 * @returns {string}
 */
function canonicalizeJson(obj) {
  if (obj === null || obj === undefined) return '{}';
  if (typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return JSON.stringify(obj);

  const sortedKeys = Object.keys(obj).sort();
  const sortedObj = {};
  for (const k of sortedKeys) {
    sortedObj[k] = obj[k];
  }
  return JSON.stringify(sortedObj);
}

/**
 * Computes SHA-256 digest of a string.
 * @param {string} data
 * @returns {string} Hexadecimal hash
 */
function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Normalizes an audit record into consistent string fields.
 * @param {Object} record
 * @returns {Object}
 */
function extractRecordFields(record = {}) {
  const prev_hash = record.prev_hash || record.prevHash || GENESIS_HASH;
  const current_hash = record.current_hash || record.currentHash || null;
  const id = record.id !== undefined && record.id !== null ? String(record.id) : '0';
  const admin_id =
    record.admin_id !== undefined && record.admin_id !== null
      ? String(record.admin_id)
      : record.adminId !== undefined && record.adminId !== null
        ? String(record.adminId)
        : 'SYSTEM';
  const action = String(record.action || 'UNKNOWN');
  const target_type = String(record.target_type || record.targetType || 'GENERAL');
  const target_id =
    record.target_id !== undefined && record.target_id !== null
      ? String(record.target_id)
      : record.targetId !== undefined && record.targetId !== null
        ? String(record.targetId)
        : 'NONE';
  const payload = record.payload;
  const createdAt = record.created_at || record.createdAt || '0';
  const created_at = createdAt instanceof Date ? createdAt.toISOString() : String(createdAt);

  return {
    id,
    admin_id,
    action,
    target_type,
    target_id,
    prev_hash,
    current_hash,
    payload,
    created_at,
  };
}

/**
 * Computes the hash for an audit log record based on its fields and previous hash.
 *
 * @param {Object} record
 * @returns {string} SHA-256 hash
 */
function computeRecordHash(record) {
  const norm = extractRecordFields(record);
  const payloadStr = canonicalizeJson(norm.payload);
  const raw = `${norm.prev_hash}|${norm.id}|${norm.admin_id}|${norm.action}|${norm.target_type}|${norm.target_id}|${payloadStr}|${norm.created_at}`;
  return sha256(raw);
}

/**
 * Generates next audit log record with computed previous and current hashes.
 *
 * @param {Object|null} prevRecord - Previous record in chain (or null for genesis)
 * @param {Object} recordData - Current record fields
 * @returns {Object} Complete record with prev_hash and current_hash
 */
function createAuditRecord(prevRecord, recordData) {
  const prevNorm = prevRecord ? extractRecordFields(prevRecord) : null;
  const prevHash = prevNorm && prevNorm.current_hash ? prevNorm.current_hash : GENESIS_HASH;

  const currentRecord = {
    ...recordData,
    prev_hash: prevHash,
    prevHash,
  };

  const currentHash = computeRecordHash(currentRecord);
  currentRecord.current_hash = currentHash;
  currentRecord.currentHash = currentHash;

  return currentRecord;
}

/**
 * Verifies the integrity of an ordered sequence of audit log records.
 *
 * @param {Array<Object>} records - Array of audit records sorted chronologically ascending
 * @returns {{
 *   isValid: boolean,
 *   verifiedCount: number,
 *   tamperedRowId: string|null,
 *   brokenIndex: number|null,
 *   reason: string|null
 * }}
 */
function verifyAuditChain(records = []) {
  if (!Array.isArray(records) || records.length === 0) {
    return {
      isValid: true,
      verifiedCount: 0,
      tamperedRowId: null,
      brokenIndex: null,
      reason: null,
    };
  }

  for (let i = 0; i < records.length; i++) {
    const row = extractRecordFields(records[i]);
    const prevHash = row.prev_hash;
    const currentHash = row.current_hash;

    // 1. Genesis record validation
    if (i === 0) {
      if (prevHash !== GENESIS_HASH) {
        return {
          isValid: false,
          verifiedCount: 0,
          tamperedRowId: row.id,
          brokenIndex: 0,
          reason: `Genesis record prev_hash does not match GENESIS_HASH (received ${prevHash})`,
        };
      }
    } else {
      // 2. Link validation: prev_hash must equal previous row's current_hash
      const priorRow = extractRecordFields(records[i - 1]);
      if (prevHash !== priorRow.current_hash) {
        return {
          isValid: false,
          verifiedCount: i,
          tamperedRowId: row.id,
          brokenIndex: i,
          reason: `Broken chain link at row ${row.id}: prev_hash does not match prior current_hash`,
        };
      }
    }

    // 3. Hash integrity: re-computed hash must equal recorded current_hash
    const computed = computeRecordHash(row);
    if (computed !== currentHash) {
      return {
        isValid: false,
        verifiedCount: i,
        tamperedRowId: row.id,
        brokenIndex: i,
        reason: `Tampered content at row ${row.id}: payload or metadata does not match cryptographic signature`,
      };
    }
  }

  return {
    isValid: true,
    verifiedCount: records.length,
    tamperedRowId: null,
    brokenIndex: null,
    reason: null,
  };
}

module.exports = {
  GENESIS_HASH,
  canonicalizeJson,
  sha256,
  extractRecordFields,
  computeRecordHash,
  createAuditRecord,
  verifyAuditChain,
};
