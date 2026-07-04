const STRANGENESS_LEVELS = [1, 3, 5, 7];
const MAX_STRANGENESS = 7;
const DEFAULT_OOV_STRANGENESS = 7;

function normalizeStrangeness(value, fallback = DEFAULT_OOV_STRANGENESS) {
  const parsed = Number.parseInt(value, 10);
  if (STRANGENESS_LEVELS.includes(parsed)) return parsed;
  if (parsed >= MAX_STRANGENESS) return MAX_STRANGENESS;
  return fallback;
}

module.exports = {
  STRANGENESS_LEVELS,
  MAX_STRANGENESS,
  DEFAULT_OOV_STRANGENESS,
  normalizeStrangeness,
};
