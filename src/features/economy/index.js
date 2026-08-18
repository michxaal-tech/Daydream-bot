/**
 * Server currency: a daily claim with a streak bonus, transfers between
 * members, and a shop that sells roles. Deliberately small — the point is a
 * reason to show up daily, not a game economy.
 */
import { collection, getIn, setIn } from '../../lib/store.js';
import { config } from '../../lib/config.js';
import { embed } from '../../lib/brand.js';

const COLLECTION = 'wallets';
const DAY = 86_400_000;

export const currency = () => config.economy?.currency ?? '🪙';
export const wallet = (userId) => getIn(COLLECTION, userId, { balance: 0, streak: 0, lastDaily: 0, claims: 0 });
export const setWallet = (userId, next) => setIn(COLLECTION, userId, next);

export function credit(userId, amount, { reason } = {}) {
  const current = wallet(userId);
  const next = { ...current, balance: Math.max(0, current.balance + amount) };
  setWallet(userId, next);
  return next;
}

/**
 * A daily claim. Miss a day and the streak resets; the bonus is capped so it
 * stays a nudge rather than a reason to feel trapped.
 */
export function claimDaily(userId, { now = Date.now() } = {}) {
  const cfg = config.economy ?? {};
  const current = wallet(userId);
  const since = now - current.lastDaily;

  if (since < DAY) {
    return { ok: false, waitMs: DAY - since, wallet: current };
  }

  // Claimed within the last 48h → the run continues. Later than that → reset.
  const streak = since < 2 * DAY ? current.streak + 1 : 1;
  const base = cfg.dailyAmount ?? 100;
  const bonus = Math.min(streak - 1, cfg.maxStreakBonusDays ?? 7) * (cfg.streakBonus ?? 25);

  const next = {
    balance: current.balance + base + bonus,
    streak, lastDaily: now, claims: (current.claims ?? 0) + 1,
  };
  setWallet(userId, next);
  return { ok: true, earned: base + bonus, base, bonus, wallet: next };
}

export function transfer(fromId, toId, amount) {
  if (fromId === toId) throw new Error("You can't pay yourself.");
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('Pick a whole amount above zero.');
  const from = wallet(fromId);
  if (from.balance < amount) throw new Error(`You only have ${from.balance} ${currency()}.`);
  setWallet(fromId, { ...from, balance: from.balance - amount });
  const to = wallet(toId);
  setWallet(toId, { ...to, balance: to.balance + amount });
  return amount;
}

export const richest = (limit = 10) =>
  Object.entries(collection(COLLECTION))
    .map(([userId, w]) => ({ userId, ...w }))
    .sort((a, b) => b.balance - a.balance)
    .slice(0, limit);

export const shopItems = () => (config.economy?.shop ?? []).filter((i) => i.roleId && i.price >= 0);

export function buy(userId, itemId) {
  const item = shopItems().find((i) => i.id === itemId);
  if (!item) throw new Error('That item is not in the shop.');
  const current = wallet(userId);
  if (current.balance < item.price) {
    throw new Error(`That costs ${item.price} ${currency()} and you have ${current.balance}.`);
  }
  setWallet(userId, { ...current, balance: current.balance - item.price });
  return item;
}

export function walletEmbed(user, w, rank) {
  return embed()
    .setAuthor({ name: user.username, iconURL: user.displayAvatarURL() })
    .setTitle(`${w.balance.toLocaleString()} ${currency()}`)
    .addFields(
      { name: 'Streak', value: w.streak ? `${w.streak} day${w.streak === 1 ? '' : 's'}` : 'none yet', inline: true },
      { name: 'Claims', value: String(w.claims ?? 0), inline: true },
      ...(rank ? [{ name: 'Rank', value: `#${rank}`, inline: true }] : [])
    );
}
