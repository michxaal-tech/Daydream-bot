import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { embed } from '../lib/brand.js';
import { config } from '../lib/config.js';
import { claimDaily, wallet, walletEmbed, transfer, richest, shopItems, buy, currency } from '../features/economy/index.js';

const enabled = () => {
  if (!config.economy?.enabled) throw new Error('The economy is switched off on this server.');
};

export default {
  data: new SlashCommandBuilder()
    .setName('coins')
    .setDescription('The server currency')
    .addSubcommand((s) => s.setName('daily').setDescription('Claim your daily coins'))
    .addSubcommand((s) => s.setName('balance').setDescription("Your balance, or somebody else's")
      .addUserOption((o) => o.setName('member').setDescription('Whose balance')))
    .addSubcommand((s) => s.setName('pay').setDescription('Send coins to somebody')
      .addUserOption((o) => o.setName('member').setDescription('Who to pay').setRequired(true))
      .addIntegerOption((o) => o.setName('amount').setDescription('How much').setRequired(true).setMinValue(1)))
    .addSubcommand((s) => s.setName('top').setDescription('The richest members'))
    .addSubcommand((s) => s.setName('shop').setDescription('What you can buy'))
    .addSubcommand((s) => s.setName('buy').setDescription('Buy something from the shop')
      .addStringOption((o) => o.setName('item').setDescription('Which item').setRequired(true).setAutocomplete(true))),

  async autocomplete(interaction) {
    const typed = interaction.options.getFocused().toLowerCase();
    await interaction.respond(
      shopItems()
        .filter((i) => i.name.toLowerCase().includes(typed))
        .slice(0, 25)
        .map((i) => ({ name: `${i.name} — ${i.price} ${currency()}`.slice(0, 90), value: i.id }))
    );
  },

  async execute(interaction) {
    enabled();
    const sub = interaction.options.getSubcommand();

    if (sub === 'daily') {
      const result = claimDaily(interaction.user.id);
      if (!result.ok) {
        const hours = Math.ceil(result.waitMs / 3_600_000);
        throw new Error(`Already claimed. Come back in about ${hours} hour${hours === 1 ? '' : 's'}.`);
      }
      const e = embed()
        .setTitle(`+${result.earned} ${currency()}`)
        .setDescription(
          result.bonus
            ? `${result.base} daily **+ ${result.bonus} streak bonus**\nYou're on a **${result.wallet.streak} day** run.`
            : `Day one of a new streak. Come back tomorrow for a bonus.`
        )
        .addFields({ name: 'Balance', value: `${result.wallet.balance.toLocaleString()} ${currency()}` });
      return interaction.reply({ embeds: [e] });
    }

    if (sub === 'balance') {
      const user = interaction.options.getUser('member') ?? interaction.user;
      const rank = richest(100).findIndex((w) => w.userId === user.id) + 1;
      return interaction.reply({ embeds: [walletEmbed(user, wallet(user.id), rank || null)], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'pay') {
      const target = interaction.options.getUser('member');
      if (target.bot) throw new Error('Bots have no use for coins.');
      const amount = interaction.options.getInteger('amount');
      transfer(interaction.user.id, target.id, amount);
      return interaction.reply(`💸 <@${interaction.user.id}> sent **${amount} ${currency()}** to <@${target.id}>.`);
    }

    if (sub === 'top') {
      const rows = richest(10);
      const e = embed().setTitle(`💰 Richest members`).setDescription(
        rows.length
          ? rows.map((w, i) => `**${i + 1}.** <@${w.userId}> — ${w.balance.toLocaleString()} ${currency()}`).join('\n')
          : 'Nobody has any coins yet.'
      );
      return interaction.reply({ embeds: [e], allowedMentions: { parse: [] } });
    }

    if (sub === 'shop') {
      const items = shopItems();
      const e = embed().setTitle('🛒 Shop').setDescription(
        items.length
          ? items.map((i) => `**${i.name}** — ${i.price} ${currency()}\n└ <@&${i.roleId}>${i.description ? ` · ${i.description}` : ''}`).join('\n')
          : 'The shop is empty. An admin can stock it from the dashboard.'
      );
      return interaction.reply({ embeds: [e], allowedMentions: { parse: [] } });
    }

    // buy
    const item = buy(interaction.user.id, interaction.options.getString('item'));
    await interaction.member.roles.add(item.roleId, `bought ${item.name}`).catch(() => {
      throw new Error(`Paid, but I couldn't give you the role — it probably sits above mine. Tell an admin.`);
    });
    return interaction.reply({ content: `✅ Bought **${item.name}** for ${item.price} ${currency()}.`, flags: MessageFlags.Ephemeral });
  },
};
