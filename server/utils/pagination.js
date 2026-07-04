function toPositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getPagination(query, defaults = {}) {
  const defaultPage = defaults.page || 1;
  const defaultLimit = defaults.limit || 50;
  const maxLimit = defaults.maxLimit || 500;
  const page = toPositiveInt(query.page, defaultPage);
  const limit = Math.min(toPositiveInt(query.limit, defaultLimit), maxLimit);
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

module.exports = {
  getPagination,
};
