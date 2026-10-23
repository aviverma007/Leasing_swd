const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { sql, getPool, SCHEMA } = require('../db');
const { uid } = require('../lib/helpers');
const router = express.Router();

/* Per-lease document vault: deed, LOI, NFA, registration, KYC…
   Files live on the app server under backend/uploads/leases/<leaseId>/ */
const UPROOT = path.join(__dirname, '..', 'uploads', 'leases');
fs.mkdirSync(UPROOT, { recursive: true });

const ALLOWED = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx', '.xls', '.xlsx']);
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(UPROOT, String(req.params.leaseId).replace(/[^a-zA-Z0-9_-]/g, ''));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, uid() + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED.has(ext)) return cb(new Error('File type not allowed. Use PDF, images, Word or Excel.'));
    cb(null, true);
  }
});

function mapDoc(r) {
  return {
    id: r.Id, leaseId: r.LeaseId, docType: r.DocType, fileName: r.FileName,
    sizeBytes: Number(r.SizeBytes || 0), uploadedBy: r.UploadedBy,
    uploadedAt: r.UploadedAt ? new Date(r.UploadedAt).toISOString() : null
  };
}

router.get('/:leaseId', async (req, res) => {
  try {
    const pool = await getPool();
    const r = await pool.request().input('l', sql.VarChar(40), req.params.leaseId)
      .query(`SELECT * FROM ${SCHEMA}.LeaseDocs WHERE LeaseId=@l ORDER BY UploadedAt DESC`);
    res.json(r.recordset.map(mapDoc));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/:leaseId', (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file received.' });
    try {
      const pool = await getPool();
      const id = uid();
      await pool.request()
        .input('id', sql.VarChar(40), id)
        .input('l', sql.VarChar(40), req.params.leaseId)
        .input('t', sql.NVarChar(60), (req.body.docType || 'Other').slice(0, 60))
        .input('fn', sql.NVarChar(300), req.file.originalname.slice(0, 300))
        .input('sn', sql.NVarChar(300), req.file.filename)
        .input('sz', sql.BigInt, req.file.size)
        .input('by', sql.NVarChar(150), req.user ? (req.user.email || req.user.username || 'system') : 'system')
        .query(`INSERT INTO ${SCHEMA}.LeaseDocs (Id,LeaseId,DocType,FileName,StoredName,SizeBytes,UploadedBy)
                VALUES (@id,@l,@t,@fn,@sn,@sz,@by)`);
      res.json({ id, fileName: req.file.originalname });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
});

router.get('/:leaseId/file/:docId', async (req, res) => {
  try {
    const pool = await getPool();
    const r = await pool.request().input('id', sql.VarChar(40), req.params.docId)
      .input('l', sql.VarChar(40), req.params.leaseId)
      .query(`SELECT * FROM ${SCHEMA}.LeaseDocs WHERE Id=@id AND LeaseId=@l`);
    const d = r.recordset[0];
    if (!d) return res.status(404).json({ error: 'Document not found' });
    const fp = path.join(UPROOT, String(d.LeaseId).replace(/[^a-zA-Z0-9_-]/g, ''), d.StoredName);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'File missing on server' });
    res.download(fp, d.FileName);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:leaseId/file/:docId', async (req, res) => {
  try {
    const pool = await getPool();
    const r = await pool.request().input('id', sql.VarChar(40), req.params.docId)
      .input('l', sql.VarChar(40), req.params.leaseId)
      .query(`SELECT * FROM ${SCHEMA}.LeaseDocs WHERE Id=@id AND LeaseId=@l`);
    const d = r.recordset[0];
    if (!d) return res.status(404).json({ error: 'Document not found' });
    await pool.request().input('id', sql.VarChar(40), req.params.docId)
      .query(`DELETE FROM ${SCHEMA}.LeaseDocs WHERE Id=@id`);
    const fp = path.join(UPROOT, String(d.LeaseId).replace(/[^a-zA-Z0-9_-]/g, ''), d.StoredName);
    try { fs.unlinkSync(fp); } catch (_) { /* row removed; file may already be gone */ }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
