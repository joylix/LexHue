function errorHandler(err, req, res, next) {
  console.error('[ERROR]', err);

  // Custom error types from route handlers
  if (err.type === 'validation') {
    return res.status(400).json({
      success: false,
      data: null,
      error: { code: 'VALIDATION_ERROR', message: err.message || 'Validation error' }
    });
  }

  if (err.type === 'not_found') {
    return res.status(404).json({
      success: false,
      data: null,
      error: { code: 'NOT_FOUND', message: err.message || 'Resource not found' }
    });
  }

  if (err.type === 'conflict') {
    return res.status(409).json({
      success: false,
      data: null,
      error: { code: 'CONFLICT', message: err.message || 'Conflict' }
    });
  }

  if (err.type === 'unauthorized') {
    return res.status(401).json({
      success: false,
      data: null,
      error: { code: 'UNAUTHORIZED', message: err.message || 'Unauthorized' }
    });
  }

  if (err.type === 'forbidden') {
    return res.status(403).json({
      success: false,
      data: null,
      error: { code: 'FORBIDDEN', message: err.message || 'Forbidden' }
    });
  }

  if (err.type === 'internal') {
    return res.status(500).json({
      success: false,
      data: null,
      error: { code: 'INTERNAL_ERROR', message: err.message || 'Internal server error' }
    });
  }

  // JSON parse errors
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      data: null,
      error: { code: 'INVALID_JSON', message: 'Invalid JSON in request body' }
    });
  }

  // Database errors
  if (err.code && (err.code.startsWith('SQLITE_') || /^[0-9A-Z]{5}$/.test(err.code))) {
    return res.status(500).json({
      success: false,
      data: null,
      error: { code: 'DATABASE_ERROR', message: 'Database operation failed' }
    });
  }

  // Default: internal server error (don't leak details in production)
  res.status(500).json({
    success: false,
    data: null,
    error: { code: 'INTERNAL_ERROR', message: process.env.NODE_ENV === 'development' ? (err.message || 'Internal server error') : 'Internal server error' }
  });
}

module.exports = errorHandler;
