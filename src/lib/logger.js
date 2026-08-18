const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const active = LEVELS[process.env.LOG_LEVEL ?? 'info'] ?? LEVELS.info;

const stamp = () => new Date().toISOString().slice(11, 19);

function emit(level, tag, args) {
  if (LEVELS[level] > active) return;
  const badge = { error: '✖', warn: '▲', info: '•', debug: '·' }[level];
  console[level === 'debug' ? 'log' : level](`${stamp()} ${badge} [${tag}]`, ...args);
}

export function logger(tag) {
  return {
    error: (...a) => emit('error', tag, a),
    warn: (...a) => emit('warn', tag, a),
    info: (...a) => emit('info', tag, a),
    debug: (...a) => emit('debug', tag, a),
  };
}
