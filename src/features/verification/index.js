/**
 * Verification gate: a button (or a tiny challenge) between arriving and
 * seeing the server. Raid bots don't press buttons, and the ones that do get
 * caught by the challenge.
 */
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getIn, setIn } from '../../lib/store.js';
import { config } from '../../lib/config.js';
import { embed } from '../../lib/brand.js';
import { logger } from '../../lib/logger.js';

const log = logger('verify');
const PENDING = 'verifyPending';
export const CUSTOM_ID = 'verify';

/** Two small numbers — enough to stop a script, not enough to annoy a human. */
export function makeChallenge(seed = Math.random()) {
  const a = 2 + Math.floor(seed * 8);
  const b = 2 + Math.floor(((seed * 97) % 1) * 8);
  const answer = a + b;
  const options = new Set([answer]);
  let salt = 1;
  while (options.size < 4) options.add(Math.max(2, answer + ((salt % 2 ? 1 : -1) * Math.ceil(salt / 2)) + 1)), salt++;
  return { question: `What is ${a} + ${b}?`, answer, options: [...options].sort((x, y) => x - y) };
}

export function panel() {
  const cfg = config.verification ?? {};
  const e = embed()
    .setTitle(cfg.title || 'Verify to get in')
    .setDescription(cfg.description || 'Press the button below and the rest of the server opens up.');
  return {
    embeds: [e],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`${CUSTOM_ID}:start`).setStyle(ButtonStyle.Success).setLabel(cfg.buttonLabel || 'Verify me').setEmoji('✅')
      ),
    ],
  };
}

/** Handles both the first press and the challenge answers. */
export async function handleButton(interaction) {
  const cfg = config.verification ?? {};
  if (!cfg.enabled) return 'Verification is switched off.';
  if (!/^\d{17,20}$/.test(cfg.roleId ?? '')) return 'No verified role is configured — tell an admin.';

  const [, step, value] = interaction.customId.split(':');

  if (interaction.member.roles.cache.has(cfg.roleId)) return "You're already verified.";

  if (step === 'start' && cfg.challenge) {
    const challenge = makeChallenge();
    setIn(PENDING, interaction.user.id, { answer: challenge.answer, at: Date.now() });
    await interaction.reply({
      content: `${challenge.question}`,
      components: [
        new ActionRowBuilder().addComponents(
          challenge.options.map((option) =>
            new ButtonBuilder().setCustomId(`${CUSTOM_ID}:answer:${option}`).setStyle(ButtonStyle.Secondary).setLabel(String(option))
          )
        ),
      ],
      flags: 64,
    });
    return null; // already replied
  }

  if (step === 'answer') {
    const pending = getIn(PENDING, interaction.user.id);
    if (!pending) return 'That challenge expired — press Verify again.';
    if (Number(value) !== pending.answer) {
      setIn(PENDING, interaction.user.id, null);
      return "That's not it. Press Verify to try again.";
    }
  }

  await interaction.member.roles.add(cfg.roleId, 'verified').catch((err) => {
    log.warn('verify role failed:', err.message);
    throw new Error("I couldn't give you the role — it probably sits above mine.");
  });
  setIn(PENDING, interaction.user.id, null);
  return cfg.successMessage || "You're in. Welcome.";
}
