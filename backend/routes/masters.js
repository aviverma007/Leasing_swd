const express = require('express');
const { sql, getPool, SCHEMA } = require('../db');
const { uid, nextNo } = require('../lib/helpers');

// Table/field maps for each master entity
const ENTITIES = {
  companies: {
    table: 'Companies', prefix: 'CO',
    cols: ['Name'],
    map: r => ({ id: r.Id, code: r.Code, name: r.Name })
  },
  assets: {
    table: 'Assets', prefix: 'AST',
    cols: ['Name', 'City'],
    map: r => ({ id: r.Id, code: r.Code, name: r.Name, city: r.City })
  },
  blocks: {
    table: 'Blocks', prefix: 'BLK',
    cols: ['Name', 'AssetId', 'TotalFloors'],
    map: r => ({ id: r.Id, code: r.Code, name: r.Name, assetId: r.AssetId, totalFloors: r.TotalFloors })
  },
  units: {
    table: 'Units', prefix: 'UNT',
    cols: ['Name', 'AssetId', 'BlockId', 'Floor', 'CarpetArea', 'BuiltupArea', 'Status'],
    map: r => ({ id: r.Id, code: r.Code, name: r.Name, assetId: r.AssetId, blockId: r.BlockId, floor: r.Floor, carpetArea: r.CarpetArea, builtupArea: r.BuiltupArea, status: r.Status })
  },
  brands: {
    table: 'Brands', prefix: 'BRD',
    cols: ['Name', 'CompanyId', 'Category', 'RegularAddress', 'Address'],
    map: r => ({ id: r.Id, code: r.Code, name: r.Name, companyId: r.CompanyId, category: r.Category, regularAddress: r.RegularAddress, address: r.Address })
  },
  users: {
    table: 'Users', prefix: 'USR',
    cols: ['Email', 'Password', 'Role', 'Active'],
    map: r => ({ id: r.Id, code: r.Code, email: r.Email, role: r.Role, active: r.Active })
  }
};

// Columns that must be bound as numbers (SQL Server rejects strings for these)
const INT_COLS = new Set(['TotalFloors', 'Floor']);
const DEC_COLS = new Set(['CarpetArea', 'BuiltupArea']);

// Bind a value with the correct SQL type; empty/blank numerics become NULL, not ''
function bindValue(request, param, col, value) {
  if (INT_COLS.has(col)) {
    const n = value === '' || value === null || value === undefined ? null : parseInt(value, 10);
    request.input(param, sql.Int, Number.isNaN(n) ? null : n);
  } else if (DEC_COLS.has(col)) {
    const n = value === '' || value === null || value === undefined ? null : parseFloat(value);
    request.input(param, sql.Decimal(18, 2), Number.isNaN(n) ? null : n);
  } else {
    request.input(param, value ?? null);
  }
}

function router(entityKey) {
  const ent = ENTITIES[entityKey];
  const r = express.Router();

  r.get('/', async (req, res) => {
    try {
      const pool = await getPool();
      const result = await pool.request().query(`SELECT * FROM ${SCHEMA}.${ent.table} ORDER BY Code`);
      res.json(result.recordset.map(ent.map));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  r.post('/', async (req, res) => {
    try {
      const pool = await getPool();
      const id = uid();
      const code = await nextNo(pool, sql, ent.prefix);
      const body = req.body || {};
      const request = pool.request();
      request.input('id', sql.VarChar(40), id);
      request.input('code', sql.VarChar(20), code);
      const colNames = [];
      const values = ['@id', '@code'];
      colNames.push('Id', 'Code');
      const fieldKeyMap = {
        Name: 'name', City: 'city', AssetId: 'assetId', BlockId: 'blockId', TotalFloors: 'totalFloors',
        Floor: 'floor', CarpetArea: 'carpetArea', BuiltupArea: 'builtupArea', Status: 'status',
        CompanyId: 'companyId', Category: 'category', RegularAddress: 'regularAddress', Address: 'address',
        Email: 'email', Password: 'password', Role: 'role', Active: 'active'
      };
      ent.cols.forEach((col, i) => {
        const key = fieldKeyMap[col];
        const param = `c${i}`;
        bindValue(request, param, col, body[key]);
        colNames.push(col);
        values.push(`@${param}`);
      });
      await request.query(`INSERT INTO ${SCHEMA}.${ent.table} (${colNames.join(',')}) VALUES (${values.join(',')})`);
      const row = await pool.request().input('id', sql.VarChar(40), id).query(`SELECT * FROM ${SCHEMA}.${ent.table} WHERE Id=@id`);
      res.json(ent.map(row.recordset[0]));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  r.put('/:id', async (req, res) => {
    try {
      const pool = await getPool();
      const body = req.body || {};
      const request = pool.request();
      request.input('id', sql.VarChar(40), req.params.id);
      const fieldKeyMap = {
        Name: 'name', City: 'city', AssetId: 'assetId', BlockId: 'blockId', TotalFloors: 'totalFloors',
        Floor: 'floor', CarpetArea: 'carpetArea', BuiltupArea: 'builtupArea', Status: 'status',
        CompanyId: 'companyId', Category: 'category', RegularAddress: 'regularAddress', Address: 'address',
        Email: 'email', Password: 'password', Role: 'role', Active: 'active'
      };
      const sets = ent.cols.map((col, i) => {
        const key = fieldKeyMap[col];
        const param = `c${i}`;
        bindValue(request, param, col, body[key]);
        return `${col}=@${param}`;
      });
      await request.query(`UPDATE ${SCHEMA}.${ent.table} SET ${sets.join(',')} WHERE Id=@id`);
      const row = await pool.request().input('id', sql.VarChar(40), req.params.id).query(`SELECT * FROM ${SCHEMA}.${ent.table} WHERE Id=@id`);
      res.json(ent.map(row.recordset[0]));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  r.delete('/:id', async (req, res) => {
    try {
      const pool = await getPool();
      await pool.request().input('id', sql.VarChar(40), req.params.id).query(`DELETE FROM ${SCHEMA}.${ent.table} WHERE Id=@id`);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return r;
}

module.exports = { router, ENTITIES };
