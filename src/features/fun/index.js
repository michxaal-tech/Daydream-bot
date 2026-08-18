/**
 * Small deterministic-ish games and lookups. Pure functions, so the tests can
 * pin the behaviour without stubbing Discord.
 */
export const EIGHTBALL = [
  'without a doubt', 'ask again later', 'absolutely not', 'the signs point to yes',
  'I wouldn\'t count on it', 'yes, obviously', 'no, and you knew that', 'too close to call',
  'definitely', 'not in this timeline', 'sure, why not', 'my sources say no',
];

export const WOULD_YOU_RATHER = [
  ['only post on TikTok forever', 'only post on YouTube forever'],
  ['lose every follower but keep the money', 'keep every follower and lose the money'],
  ['never read a comment again', 'read every comment ever written about you'],
  ['film in one location for a year', 'travel constantly and never edit at home'],
  ['have a viral video you hate', 'have a great video nobody sees'],
  ['stream 8 hours a day', 'edit 8 hours a day'],
  ['collab with anyone you like, once', 'a guaranteed audience forever, alone'],
];

export const COMPLIMENTS = [
  'your edits have a rhythm most people never find',
  'you make hard things look effortless, which is its own skill',
  'the server got noticeably better once you showed up',
  'you ask the questions everyone else was too shy to ask',
  'your taste is genuinely good and you should trust it more',
];

/** Roll dice in NdM notation. Returns the individual rolls too. */
export function rollDice(notation, roll = Math.random) {
  const match = /^(\d{0,3})d(\d{1,3})$/i.exec(String(notation ?? '').trim());
  if (!match) return null;
  const count = Math.min(Math.max(Number(match[1] || 1), 1), 25);
  const sides = Math.min(Math.max(Number(match[2]), 2), 1000);
  const rolls = Array.from({ length: count }, () => 1 + Math.floor(roll() * sides));
  return { count, sides, rolls, total: rolls.reduce((a, b) => a + b, 0) };
}

export const pick = (list, roll = Math.random) => list[Math.floor(roll() * list.length)];

/** Split "a, b, c" or "a | b | c" into choices. */
export const parseChoices = (input) =>
  String(input ?? '')
    .split(/\s*[|,]\s*/)
    .map((c) => c.trim())
    .filter(Boolean);

/** Discord's timestamp markup, so people can post times that localise. */
export const TIMESTAMP_STYLES = {
  short_time: 't', long_time: 'T', short_date: 'd', long_date: 'D',
  full: 'F', relative: 'R',
};

export function discordTimestamp(date, style = 'F') {
  return `<t:${Math.floor(date.getTime() / 1000)}:${style}>`;
}

/**
 * "in 2 hours", "tomorrow 9pm", "2026-09-01 18:30" → a Date, or null.
 * Deliberately narrow: predictable beats clever for a timestamp helper.
 */
export function parseWhen(input, now = new Date()) {
  const text = String(input ?? '').toLowerCase().trim();
  if (!text) return null;

  const relative = /^in\s+(\d+)\s*(m|min|mins|minute|minutes|h|hr|hour|hours|d|day|days|w|week|weeks)$/.exec(text);
  if (relative) {
    const amount = Number(relative[1]);
    const unit = relative[2][0];
    const ms = { m: 6e4, h: 36e5, d: 864e5, w: 6048e5 }[unit];
    return new Date(now.getTime() + amount * ms);
  }

  const iso = new Date(text.replace(' ', 'T'));
  if (!Number.isNaN(iso.getTime())) return iso;

  const clock = /^(?:(today|tomorrow)\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/.exec(text);
  if (clock) {
    const [, day, rawHour, minute, meridiem] = clock;
    let hour = Number(rawHour);
    if (meridiem === 'pm' && hour < 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;
    const date = new Date(now);
    if (day === 'tomorrow') date.setDate(date.getDate() + 1);
    date.setHours(hour, Number(minute ?? 0), 0, 0);
    return date;
  }
  return null;
}
