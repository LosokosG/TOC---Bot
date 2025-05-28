// channel-formatter.js - Komenda do formatowania nazw kanałów
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

// Regex do wykrywania emotek Unicode i custom emotek Discord
const EMOJI_REGEX = /^([\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|<:\w+:\d+>|<a:\w+:\d+>)/u;

// Funkcja do sprawdzenia czy kanał już ma separator
function hasSepaRator(channelName) {
    const match = channelName.match(EMOJI_REGEX);
    if (match) {
        const afterEmoji = channelName.substring(match[0].length);
        return afterEmoji.startsWith('┃');
    }
    return false;
}

// Funkcja do formatowania nazwy kanału
function formatChannelName(channelName) {
    const match = channelName.match(EMOJI_REGEX);
    if (match && !hasSepaRator(channelName)) {
        const emoji = match[0];
        const restOfName = channelName.substring(emoji.length);
        return emoji + '┃' + restOfName;
    }
    return channelName;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('format-channels')
        .setDescription('Formatuje nazwy wszystkich kanałów dodając separator po emotce')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addBooleanOption(option =>
            option.setName('preview')
                .setDescription('Tylko pokazuje zmiany bez ich wykonania')
                .setRequired(false)),
    
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        
        const preview = interaction.options.getBoolean('preview') ?? false;
        const guild = interaction.guild;
        
        // Pobierz wszystkie kanały tekstowe
        const channels = guild.channels.cache.filter(channel => 
            channel.type === 0 || channel.type === 2 // GUILD_TEXT lub GUILD_VOICE
        );
        
        const changesToMake = [];
        const alreadyFormatted = [];
        const noEmoji = [];
        
        // Analizuj kanały
        for (const [id, channel] of channels) {
            const currentName = channel.name;
            
            if (EMOJI_REGEX.test(currentName)) {
                if (hasSepaRator(currentName)) {
                    alreadyFormatted.push(currentName);
                } else {
                    const newName = formatChannelName(currentName);
                    changesToMake.push({
                        channel: channel,
                        oldName: currentName,
                        newName: newName
                    });
                }
            } else {
                noEmoji.push(currentName);
            }
        }
        
        // Generuj raport
        let response = '📊 **Raport formatowania kanałów**\n\n';
        
        if (changesToMake.length > 0) {
            response += `✏️ **Kanały do zmiany (${changesToMake.length}):**\n`;
            for (const change of changesToMake.slice(0, 10)) {
                response += `• \`${change.oldName}\` → \`${change.newName}\`\n`;
            }
            if (changesToMake.length > 10) {
                response += `• *...i ${changesToMake.length - 10} więcej*\n`;
            }
            response += '\n';
        }
        
        if (alreadyFormatted.length > 0) {
            response += `✅ **Już sformatowane (${alreadyFormatted.length}):**\n`;
            for (const name of alreadyFormatted.slice(0, 5)) {
                response += `• \`${name}\`\n`;
            }
            if (alreadyFormatted.length > 5) {
                response += `• *...i ${alreadyFormatted.length - 5} więcej*\n`;
            }
            response += '\n';
        }
        
        if (noEmoji.length > 0) {
            response += `❌ **Bez emotki (${noEmoji.length}):**\n`;
            for (const name of noEmoji.slice(0, 5)) {
                response += `• \`${name}\`\n`;
            }
            if (noEmoji.length > 5) {
                response += `• *...i ${noEmoji.length - 5} więcej*\n`;
            }
        }
        
        // Jeśli to nie preview i są zmiany do wykonania
        if (!preview && changesToMake.length > 0) {
            response += '\n⏳ **Wykonuję zmiany...**\n';
            await interaction.editReply(response);
            
            let successCount = 0;
            let errorCount = 0;
            
            for (const change of changesToMake) {
                try {
                    await change.channel.setName(change.newName);
                    successCount++;
                    // Mała przerwa żeby nie przekroczyć rate limit
                    await new Promise(resolve => setTimeout(resolve, 1000));
                } catch (error) {
                    errorCount++;
                    console.error(`Błąd zmiany nazwy kanału ${change.oldName}:`, error);
                }
            }
            
            response += `\n✅ **Zakończono!**\n`;
            response += `• Zmieniono: ${successCount} kanałów\n`;
            if (errorCount > 0) {
                response += `• Błędy: ${errorCount} kanałów\n`;
            }
        } else if (preview) {
            response += '\n⚠️ **To był tylko podgląd. Użyj komendy bez opcji `preview` aby wykonać zmiany.**';
        } else if (changesToMake.length === 0) {
            response = '✅ Wszystkie kanały z emotkami są już poprawnie sformatowane!';
        }
        
        await interaction.editReply(response);
    }
};