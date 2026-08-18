/**
 * Self-assign role panels.
 *
 * The missing half of upload notifications: without this, someone has to hand
 * out @YouTube Notifs by hand. A panel is a message with one button per role;
 * pressing a button toggles that role and replies privately.
 */
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { config } from '../../lib/config.js';
import { embed, safeEmoji } from '../../lib/brand.js';
import { logger } from '../../lib/logger.js';

const log = logger('roles');
export const CUSTOM_ID = 'rolemenu';

export const panels = () => config.roleMenus?.panels ?? [];
export const findPanel = (id) => panels().find((p) => p.id === id) ?? null;

export function panelEmbed(panel) {
  const e = embed()
    .setTitle(panel.title || 'Pick your roles')
    .setDescription(
      [
        panel.description || 'Tap a button to give yourself a role. Tap it again to take it off.',
        '',
        ...(panel.roles ?? []).map((r) => `${r.emoji ? `${r.emoji} ` : ''}**${r.label}** — <@&${r.roleId}>${r.description ? ` · ${r.description}` : ''}`),
      ].join('\n')
    );
  return e;
}

export function panelButtons(panel) {
  const rows = [];
  const roles = (panel.roles ?? []).filter((r) => /^\d{17,20}$/.test(r.roleId ?? ''));
  for (let i = 0; i < roles.length; i += 5) {
    rows.push(
      new ActionRowBuilder().addComponents(
        roles.slice(i, i + 5).map((role) => {
          const button = new ButtonBuilder()
            .setCustomId(`${CUSTOM_ID}:${panel.id}:${role.roleId}`)
            .setStyle(ButtonStyle.Secondary)
            .setLabel(String(role.label ?? 'Role').slice(0, 40));
          const emoji = safeEmoji(role.emoji);
          if (emoji) button.setEmoji(emoji);
          return button;
        })
      )
    );
  }
  return rows.slice(0, 5);
}

export const renderPanel = (panel) => ({
  embeds: [panelEmbed(panel)],
  components: panelButtons(panel),
  allowedMentions: { parse: [] },
});

/** Toggle the pressed role. Returns the line to reply with. */
export async function handleButton(interaction) {
  const [, panelId, roleId] = interaction.customId.split(':');
  const panel = findPanel(panelId);
  if (!panel) return 'That panel is no longer configured.';
  if (!panel.roles?.some((r) => r.roleId === roleId)) return 'That role is not on this panel any more.';

  const role = interaction.guild.roles.cache.get(roleId);
  if (!role) return 'That role has been deleted.';

  const me = await interaction.guild.members.fetchMe();
  if (role.position >= me.roles.highest.position) {
    log.warn(`cannot assign ${role.name} — it outranks me`);
    return `I can't hand out **${role.name}** — it sits above my own role. An admin needs to move mine higher.`;
  }

  const member = interaction.member;
  if (member.roles.cache.has(roleId)) {
    await member.roles.remove(roleId, 'role menu');
    return `Removed **${role.name}**.`;
  }

  // "exclusive" panels are for pick-one choices, like a region or a colour.
  if (panel.exclusive) {
    const others = panel.roles.map((r) => r.roleId).filter((id) => id !== roleId && member.roles.cache.has(id));
    if (others.length) await member.roles.remove(others, 'role menu (exclusive)');
  }

  await member.roles.add(roleId, 'role menu');
  return `Added **${role.name}**.`;
}
