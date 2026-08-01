const jwt = require('jsonwebtoken');
const { canView, canEdit, canApprove } = require('../lib/permissions');

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-env';

// Verify the bearer token and attach req.user ({ id, email, role, isAdmin })
function requireAuth(req, res, next) {
  const hdr = req.headers.authorization || '';
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Not signed in.' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Session expired — please sign in again.' });
  }
}

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Enforce module-level access. `module` is a key from the permissions matrix.
// GET/HEAD need 'view'; anything mutating needs 'edit'.
function requireModule(module) {
  return (req, res, next) => {
    const role = req.user && req.user.role;
    if (!role) return res.status(401).json({ error: 'Not signed in.' });
    const needRead = READ_METHODS.has(req.method);
    const ok = needRead ? canView(role, module) : canEdit(role, module);
    if (!ok) {
      return res.status(403).json({
        error: needRead
          ? `Your role (${role}) cannot view ${module}.`
          : `Your role (${role}) cannot modify ${module}.`
      });
    }
    next();
  };
}

// Enforce approver-only actions (investor-unit / disbursement approvals)
function requireApprover(req, res, next) {
  const role = req.user && req.user.role;
  if (!canApprove(role)) {
    return res.status(403).json({ error: `Your role (${role}) cannot approve. Requires Admin, Finance Head, or Portfolio Head.` });
  }
  next();
}

module.exports = { requireAuth, requireModule, requireApprover };
