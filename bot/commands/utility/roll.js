// ------------------- Importing necessary modules -------------------
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const MersenneTwister = require('mersenne-twister');
const { evaluate } = require('@app/shared/utils/mathParser');

// ------------------- Initialize Mersenne Twister for random number generation -------------------
const mt = new MersenneTwister();

// ------------------- Roll class to handle roll data and operations -------------------
class Roll {
  constructor(data = null) {
    this.errors = [];
    this.pretty = [];
    this.expressions = [];
    if (data) {
      Object.assign(this, data);
    }
  }

  // ------------------- Parse a roll command string into a Roll object -------------------
  static parseRoll(m) {
    const self = new Roll();
    const flavorMatch = m.match(/#\s*(.*)$/);
    if (flavorMatch) {
      self.flavor = flavorMatch[1];
      m = m.replace(/#\s*(.*)$/, '').trim();
    }
    self.raw = m;
    const parts = m.split(' ');

    parts.forEach(p => this.parsePart(self, p));
    self.result = evaluate(self.expressions.join(' '));
    self.text = self.errors.length ? self.errors.join('; ') : `${self.pretty.join(' ')} = **${self.result}**`;

    return self;
  }

  // ------------------- Parse a part of the roll command string -------------------
  static parsePart(self, p) {
    const d = p.match(/([1-9]\d*)?[dDfF]([1-9fF]\d*)?([aAdDkKlLter+])?([0-9=<>]*)?/);
    if (d) {
      const ex = this.handleDice(d);
      if (ex.error) {
        self.errors.push(ex.error);
      } else {
        self.pretty.push(ex.pretty);
        self.expressions.push(ex.expression);
      }
    } else if (p.match(/[0-9?:><=+\-*/()]/)) {
      self.expressions.push(p);
      self.pretty.push(p);
    } else {
      self.errors.push(`❌ Unrecognized roll expression: \`${p}\``);
    }
  }

  // ------------------- Handle the dice roll and return the expression and pretty print version -------------------
  static handleDice(d) {
    // Extract dice count and sides, ensuring they are valid integers
    const count = d[1] ? parseInt(d[1]) : 1; // Defaults to 1 if not specified
    const die = d[2] ? parseInt(d[2]) : 20; // Defaults to 20 sides if not specified

    // ------------------- Add validation for dice count and sides -------------------
    if (!Number.isInteger(count) || count <= 0) {
        return { error: `❌ The number of dice must be a positive integer greater than 0. You requested ${count}.` };
    }
    if (!Number.isInteger(die) || die <= 0) {
        return { error: `❌ The number of sides on a die must be a positive integer greater than 0. You requested ${die}.` };
    }

    // ------------------- Add limits to dice count and die sides -------------------
    if (count > 100) {
        return { error: `❌ Maximum allowed number of dice is 100. You requested ${count}.` };
    }
    if (die > 1000) {
        return { error: `❌ Maximum allowed sides on a die is 1000. You requested ${die}.` };
    }

    // ------------------- Generate dice rolls -------------------
    const adv = d[3] && d[3].toLowerCase().includes('a');
    const dis = d[3] && d[3].toLowerCase().includes('d');
    const ex = Array(count).fill(0).map(() => 1 + Math.floor(mt.random() * die));

    if (adv || dis) {
        const ex2 = Array(count).fill(0).map(() => 1 + Math.floor(mt.random() * die));
        const exs = evaluate(ex.join('+'));
        const ex2s = evaluate(ex2.join('+'));
        const [best, worst] = [Math.max(exs, ex2s), Math.min(exs, ex2s)];
        const final = adv ? best : worst;
        return { pretty: `${ex.join(' ')} > ${ex2.join(' ')}`, expression: final.toString() };
    }

    return { pretty: ex.join('+'), expression: ex.join('+') };
  }

  // ------------------- Generate a random color for the embed message -------------------
  static getRandomColor() {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
      color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
  }
}

// ------------------- Exporting the slash command for rolling dice -------------------
module.exports = {
  data: new SlashCommandBuilder()
    .setName('roll')
    .setDescription('🎲 Rolls a dice and returns the result')
    .addIntegerOption(option =>
      option.setName('dice')
        .setDescription('The number of dice to roll')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option.setName('sides')
        .setDescription('The number of sides on each die')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('flavor')
        .setDescription('A flavor or description for the roll')
        .setRequired(false)
    )
    .addStringOption(option =>
      option.setName('advantage')
        .setDescription('Advantage or disadvantage')
        .setRequired(false)
        .addChoices(
          { name: 'Advantage', value: 'a' },
          { name: 'Disadvantage', value: 'd' }
        )
    ),

  // ------------------- Execute function to handle the roll command -------------------
  async execute(interaction) {
    const dice = interaction.options.getInteger('dice');
    const sides = interaction.options.getInteger('sides');
    const flavor = interaction.options.getString('flavor');
    const advantage = interaction.options.getString('advantage');

    // Validate inputs before proceeding
    if (dice <= 0) {
      return await interaction.reply({ content: `❌ The number of dice must be a positive integer greater than 0. You requested ${dice}.`, ephemeral: true });
    }
    if (sides <= 0) {
      return await interaction.reply({ content: `❌ The number of sides on a die must be a positive integer greater than 0. You requested ${sides}.`, ephemeral: true });
    }

    // Construct the roll expression
    let expression = `${dice}d${sides}`;
    if (advantage) {
      expression += advantage;
    }
    if (flavor) {
      expression += ` # ${flavor}`;
    }

    // Parse the roll and determine the outcome
    const roll = Roll.parseRoll(expression);
    if (roll.errors.length) {
      return await interaction.reply({ content: roll.errors.join('\n'), ephemeral: true });
    }

    let advText = '';
    if (advantage) {
      advText = advantage === 'a' ? '_Rolling with Advantage_' : '_Rolling with Disadvantage_';
    }

    // Create an embed to display the result
    const embed = new EmbedBuilder()
      .setDescription(`🎲 **Roll Result:** ${roll.result}\n${advText}`)
      .setColor(Roll.getRandomColor())
      .setFooter({
        text: `${expression.split('#')[0].trim()} = ${roll.pretty} = ${roll.result}`
      });

    // Add flavor text to the embed if provided
    if (flavor) {
      embed.addFields({
        name: 'Flavor',
        value: flavor,
        inline: false
      });
    }

    // Send the result back to the user
    await interaction.reply({ embeds: [embed] });
  }
};
