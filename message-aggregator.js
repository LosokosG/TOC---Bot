// message-aggregator.js - Komenda do agregacji wiadomości z kanałów
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');

const CONFIG_FILE = path.join(__dirname, 'aggregator-config.json');

// Funkcja do wczytania konfiguracji
async function loadConfig() {
    try {
        const data = await fs.readFile(CONFIG_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            return { aggregators: [] };
        }
        throw error;
    }
}

// Funkcja do zapisania konfiguracji
async function saveConfig(config) {
    await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
}

// Funkcja do sprawdzenia czy kanał powinien być skanowany
function shouldScanChannel(channelId, aggregator, guild) {
    if (aggregator.excludedChannels && aggregator.excludedChannels.includes(channelId)) {
        return false;
    }
    
    if (aggregator.channels && aggregator.channels.includes(channelId)) {
        return true;
    }
    
    if (aggregator.categories && aggregator.categories.length > 0) {
        const channel = guild.channels.cache.get(channelId);
        if (channel && channel.parentId && aggregator.categories.includes(channel.parentId)) {
            return true;
        }
    }
    
    return false;
}

// Funkcja do obsługi nowych wiadomości
async function handleNewMessage(message, client) {
    try {
        if (message.author.id === client.user.id) {
            return;
        }
        
        const config = await loadConfig();
        
        for (const aggregator of config.aggregators) {
            if (!aggregator.enabled) continue;
            
            if (shouldScanChannel(message.channel.id, aggregator, message.guild)) {
                const targetChannel = message.guild.channels.cache.get(aggregator.targetChannel);
                
                if (!targetChannel) {
                    console.error(`Kanał docelowy ${aggregator.targetChannel} nie został znaleziony dla agregatora ${aggregator.name}`);
                    continue;
                }
                
                const embed = new EmbedBuilder()
                    .setAuthor({
                        name: message.author.displayName || message.author.username,
                        iconURL: message.author.displayAvatarURL()
                    })
                    .setDescription(message.content || '*[Brak treści tekstowej]*')
                    .addFields([
                        {
                            name: '📍 Źródło',
                            value: `<#${message.channel.id}>`,
                            inline: true
                        },
                        {
                            name: '🕐 Czas',
                            value: `<t:${Math.floor(message.createdTimestamp / 1000)}:R>`,
                            inline: true
                        }
                    ])
                    .setColor(0x5865F2)
                    .setTimestamp(message.createdAt);
                
                const messageLink = `https://discord.com/channels/${message.guild.id}/${message.channel.id}/${message.id}`;
                embed.addFields([{
                    name: '🔗 Link',
                    value: `[Przejdź do wiadomości](${messageLink})`,
                    inline: true
                }]);
                
                if (message.attachments.size > 0) {
                    const attachmentUrls = message.attachments.map(att => `[${att.name}](${att.url})`).join('\n');
                    embed.addFields([{
                        name: '📎 Załączniki',
                        value: attachmentUrls.length > 1000 ? attachmentUrls.substring(0, 1000) + '...' : attachmentUrls,
                        inline: false
                    }]);
                    
                    const firstAttachment = message.attachments.first();
                    if (firstAttachment && firstAttachment.contentType && firstAttachment.contentType.startsWith('image/')) {
                        embed.setThumbnail(firstAttachment.url);
                    }
                }
                
                try {
                    await targetChannel.send({ embeds: [embed] });
                } catch (sendError) {
                    console.error(`Błąd wysyłania wiadomości do kanału ${targetChannel.name}:`, sendError);
                }
            }
        }
    } catch (error) {
        console.error('Błąd w handleNewMessage:', error);
    }
}

// Funkcja do generowania unikalnego ID
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('message-aggregator')
        .setDescription('Zarządzaj agregacją wiadomości z kanałów')
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Dodaj nowy agregator wiadomości')
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('Nazwa agregatora')
                        .setRequired(true))
                .addChannelOption(option =>
                    option.setName('target-channel')
                        .setDescription('Kanał docelowy gdzie będą wysyłane wiadomości')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('add-category')
                .setDescription('Dodaj kategorię do agregatora')
                .addStringOption(option =>
                    option.setName('aggregator-id')
                        .setDescription('ID agregatora')
                        .setRequired(true))
                .addChannelOption(option =>
                    option.setName('category')
                        .setDescription('Kategoria do dodania')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('add-channel')
                .setDescription('Dodaj kanał do agregatora')
                .addStringOption(option =>
                    option.setName('aggregator-id')
                        .setDescription('ID agregatora')
                        .setRequired(true))
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('Kanał do dodania')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('exclude-channel')
                .setDescription('Wyklucz kanał z agregatora')
                .addStringOption(option =>
                    option.setName('aggregator-id')
                        .setDescription('ID agregatora')
                        .setRequired(true))
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('Kanał do wykluczenia')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove-category')
                .setDescription('Usuń kategorię z agregatora')
                .addStringOption(option =>
                    option.setName('aggregator-id')
                        .setDescription('ID agregatora')
                        .setRequired(true))
                .addChannelOption(option =>
                    option.setName('category')
                        .setDescription('Kategoria do usunięcia')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove-channel')
                .setDescription('Usuń kanał z agregatora')
                .addStringOption(option =>
                    option.setName('aggregator-id')
                        .setDescription('ID agregatora')
                        .setRequired(true))
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('Kanał do usunięcia')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('unexclude-channel')
                .setDescription('Usuń wykluczenie kanału')
                .addStringOption(option =>
                    option.setName('aggregator-id')
                        .setDescription('ID agregatora')
                        .setRequired(true))
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('Kanał do odblokowania')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('Pokaż listę wszystkich agregatrów'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('info')
                .setDescription('Pokaż szczegóły agregatora')
                .addStringOption(option =>
                    option.setName('aggregator-id')
                        .setDescription('ID agregatora')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('toggle')
                .setDescription('Włącz/wyłącz agregator')
                .addStringOption(option =>
                    option.setName('aggregator-id')
                        .setDescription('ID agregatora')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Usuń agregator')
                .addStringOption(option =>
                    option.setName('aggregator-id')
                        .setDescription('ID agregatora')
                        .setRequired(true)))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    
    handleNewMessage,
    
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        await interaction.deferReply({ ephemeral: true });
        
        try {
            const config = await loadConfig();
            
            switch (subcommand) {
                case 'add':
                    await handleAdd(interaction, config);
                    break;
                case 'add-category':
                    await handleAddCategory(interaction, config);
                    break;
                case 'add-channel':
                    await handleAddChannel(interaction, config);
                    break;
                case 'exclude-channel':
                    await handleExcludeChannel(interaction, config);
                    break;
                case 'remove-category':
                    await handleRemoveCategory(interaction, config);
                    break;
                case 'remove-channel':
                    await handleRemoveChannel(interaction, config);
                    break;
                case 'unexclude-channel':
                    await handleUnexcludeChannel(interaction, config);
                    break;
                case 'list':
                    await handleList(interaction, config);
                    break;
                case 'info':
                    await handleInfo(interaction, config);
                    break;
                case 'toggle':
                    await handleToggle(interaction, config);
                    break;
                case 'remove':
                    await handleRemove(interaction, config);
                    break;
            }
        } catch (error) {
            console.error(`Błąd w subcommand ${subcommand}:`, error);
            await interaction.editReply('❌ Wystąpił błąd podczas wykonywania komendy.');
        }
    }
};

// Dodaj agregator
async function handleAdd(interaction, config) {
    const name = interaction.options.getString('name');
    const targetChannel = interaction.options.getChannel('target-channel');
    
    if (targetChannel.type !== 0) {
        await interaction.editReply('❌ Kanał docelowy musi być kanałem tekstowym!');
        return;
    }
    
    if (config.aggregators.some(agg => agg.name === name)) {
        await interaction.editReply('❌ Agregator o tej nazwie już istnieje!');
        return;
    }
    
    const newAggregator = {
        id: generateId(),
        name: name,
        targetChannel: targetChannel.id,
        categories: [],
        channels: [],
        excludedChannels: [],
        enabled: true
    };
    
    config.aggregators.push(newAggregator);
    await saveConfig(config);
    
    await interaction.editReply(`✅ **Agregator "${name}" został utworzony!**\n\n🆔 **ID:** \`${newAggregator.id}\`\n🎯 **Kanał docelowy:** <#${targetChannel.id}>`);
}

// Dodaj kategorię
async function handleAddCategory(interaction, config) {
    const aggregatorId = interaction.options.getString('aggregator-id');
    const category = interaction.options.getChannel('category');
    
    const aggregator = config.aggregators.find(agg => agg.id === aggregatorId);
    if (!aggregator) {
        await interaction.editReply('❌ Nie znaleziono agregatora o podanym ID!');
        return;
    }
    
    if (category.type !== 4) {
        await interaction.editReply('❌ Musisz wybrać kategorię!');
        return;
    }
    
    if (aggregator.categories.includes(category.id)) {
        await interaction.editReply('❌ Ta kategoria jest już dodana!');
        return;
    }
    
    aggregator.categories.push(category.id);
    await saveConfig(config);
    
    await interaction.editReply(`✅ Dodano kategorię **${category.name}** do agregatora **${aggregator.name}**`);
}

// Dodaj kanał
async function handleAddChannel(interaction, config) {
    const aggregatorId = interaction.options.getString('aggregator-id');
    const channel = interaction.options.getChannel('channel');
    
    const aggregator = config.aggregators.find(agg => agg.id === aggregatorId);
    if (!aggregator) {
        await interaction.editReply('❌ Nie znaleziono agregatora o podanym ID!');
        return;
    }
    
    if (channel.type !== 0 && channel.type !== 2) {
        await interaction.editReply('❌ Kanał musi być tekstowy lub głosowy!');
        return;
    }
    
    if (aggregator.channels.includes(channel.id)) {
        await interaction.editReply('❌ Ten kanał jest już dodany!');
        return;
    }
    
    aggregator.channels.push(channel.id);
    await saveConfig(config);
    
    await interaction.editReply(`✅ Dodano kanał <#${channel.id}> do agregatora **${aggregator.name}**`);
}

// Wyklucz kanał
async function handleExcludeChannel(interaction, config) {
    const aggregatorId = interaction.options.getString('aggregator-id');
    const channel = interaction.options.getChannel('channel');
    
    const aggregator = config.aggregators.find(agg => agg.id === aggregatorId);
    if (!aggregator) {
        await interaction.editReply('❌ Nie znaleziono agregatora o podanym ID!');
        return;
    }
    
    if (aggregator.excludedChannels.includes(channel.id)) {
        await interaction.editReply('❌ Ten kanał jest już wykluczony!');
        return;
    }
    
    aggregator.excludedChannels.push(channel.id);
    await saveConfig(config);
    
    await interaction.editReply(`✅ Wykluczono kanał <#${channel.id}> z agregatora **${aggregator.name}**`);
}

// Usuń kategorię
async function handleRemoveCategory(interaction, config) {
    const aggregatorId = interaction.options.getString('aggregator-id');
    const category = interaction.options.getChannel('category');
    
    const aggregator = config.aggregators.find(agg => agg.id === aggregatorId);
    if (!aggregator) {
        await interaction.editReply('❌ Nie znaleziono agregatora o podanym ID!');
        return;
    }
    
    const index = aggregator.categories.indexOf(category.id);
    if (index === -1) {
        await interaction.editReply('❌ Ta kategoria nie jest dodana!');
        return;
    }
    
    aggregator.categories.splice(index, 1);
    await saveConfig(config);
    
    await interaction.editReply(`✅ Usunięto kategorię **${category.name}** z agregatora **${aggregator.name}**`);
}

// Usuń kanał
async function handleRemoveChannel(interaction, config) {
    const aggregatorId = interaction.options.getString('aggregator-id');
    const channel = interaction.options.getChannel('channel');
    
    const aggregator = config.aggregators.find(agg => agg.id === aggregatorId);
    if (!aggregator) {
        await interaction.editReply('❌ Nie znaleziono agregatora o podanym ID!');
        return;
    }
    
    const index = aggregator.channels.indexOf(channel.id);
    if (index === -1) {
        await interaction.editReply('❌ Ten kanał nie jest dodany!');
        return;
    }
    
    aggregator.channels.splice(index, 1);
    await saveConfig(config);
    
    await interaction.editReply(`✅ Usunięto kanał <#${channel.id}> z agregatora **${aggregator.name}**`);
}

// Usuń wykluczenie kanału
async function handleUnexcludeChannel(interaction, config) {
    const aggregatorId = interaction.options.getString('aggregator-id');
    const channel = interaction.options.getChannel('channel');
    
    const aggregator = config.aggregators.find(agg => agg.id === aggregatorId);
    if (!aggregator) {
        await interaction.editReply('❌ Nie znaleziono agregatora o podanym ID!');
        return;
    }
    
    const index = aggregator.excludedChannels.indexOf(channel.id);
    if (index === -1) {
        await interaction.editReply('❌ Ten kanał nie jest wykluczony!');
        return;
    }
    
    aggregator.excludedChannels.splice(index, 1);
    await saveConfig(config);
    
    await interaction.editReply(`✅ Usunięto wykluczenie kanału <#${channel.id}> z agregatora **${aggregator.name}**`);
}

// Lista agregatrów
async function handleList(interaction, config) {
    if (config.aggregators.length === 0) {
        await interaction.editReply('📋 **Brak skonfigurowanych agregatrów.**');
        return;
    }
    
    let message = `📋 **Lista agregatrów (${config.aggregators.length}):**\n\n`;
    
    config.aggregators.forEach(agg => {
        const status = agg.enabled ? '🟢' : '🔴';
        const sourcesCount = (agg.categories?.length || 0) + (agg.channels?.length || 0);
        const excludedCount = agg.excludedChannels?.length || 0;
        
        message += `${status} **${agg.name}**\n`;
        message += `   • ID: \`${agg.id}\`\n`;
        message += `   • Docelowy: <#${agg.targetChannel}>\n`;
        message += `   • Źródła: ${sourcesCount} | Wykluczone: ${excludedCount}\n\n`;
    });
    
    await interaction.editReply(message);
}

// Info o agregatorze
async function handleInfo(interaction, config) {
    const aggregatorId = interaction.options.getString('aggregator-id');
    
    const aggregator = config.aggregators.find(agg => agg.id === aggregatorId);
    if (!aggregator) {
        await interaction.editReply('❌ Nie znaleziono agregatora o podanym ID!');
        return;
    }
    
    let message = `ℹ️ **Agregator "${aggregator.name}"**\n\n`;
    message += `🆔 **ID:** \`${aggregator.id}\`\n`;
    message += `🎯 **Kanał docelowy:** <#${aggregator.targetChannel}>\n`;
    message += `📊 **Status:** ${aggregator.enabled ? '🟢 Włączony' : '🔴 Wyłączony'}\n\n`;
    
    if (aggregator.categories.length > 0) {
        message += `📁 **Skanowane kategorie (${aggregator.categories.length}):**\n`;
        aggregator.categories.forEach(catId => {
            const category = interaction.guild.channels.cache.get(catId);
            const name = category ? category.name : `ID: ${catId}`;
            message += `• ${name}\n`;
        });
        message += '\n';
    }
    
    if (aggregator.channels.length > 0) {
        message += `💬 **Skanowane kanały (${aggregator.channels.length}):**\n`;
        aggregator.channels.forEach(chId => {
            message += `• <#${chId}>\n`;
        });
        message += '\n';
    }
    
    if (aggregator.excludedChannels.length > 0) {
        message += `🚫 **Wykluczone kanały (${aggregator.excludedChannels.length}):**\n`;
        aggregator.excludedChannels.forEach(chId => {
            message += `• <#${chId}>\n`;
        });
        message += '\n';
    }
    
    if (aggregator.categories.length === 0 && aggregator.channels.length === 0) {
        message += '⚠️ **Brak skonfigurowanych źródeł!**\n\n';
    }
    
    await interaction.editReply(message);
}

// Przełącz status
async function handleToggle(interaction, config) {
    const aggregatorId = interaction.options.getString('aggregator-id');
    
    const aggregator = config.aggregators.find(agg => agg.id === aggregatorId);
    if (!aggregator) {
        await interaction.editReply('❌ Nie znaleziono agregatora o podanym ID!');
        return;
    }
    
    aggregator.enabled = !aggregator.enabled;
    await saveConfig(config);
    
    const status = aggregator.enabled ? '🟢 włączony' : '🔴 wyłączony';
    await interaction.editReply(`✅ **Agregator "${aggregator.name}" jest teraz ${status}!**`);
}

// Usuń agregator
async function handleRemove(interaction, config) {
    const aggregatorId = interaction.options.getString('aggregator-id');
    
    const aggregatorIndex = config.aggregators.findIndex(agg => agg.id === aggregatorId);
    if (aggregatorIndex === -1) {
        await interaction.editReply('❌ Nie znaleziono agregatora o podanym ID!');
        return;
    }
    
    const aggregator = config.aggregators[aggregatorIndex];
    config.aggregators.splice(aggregatorIndex, 1);
    await saveConfig(config);
    
    await interaction.editReply(`✅ **Agregator "${aggregator.name}" został usunięty!**`);
}