// rename-emojis.js - Komenda do zamiany emoji w nazwach kanałów
const { SlashCommandBuilder, PermissionFlagsBits, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');

// Funkcja do sprawdzenia czy tekst zawiera emoji (Unicode lub custom Discord)
function containsEmoji(text, emoji) {
    // Sprawdź custom emoji Discord (<:name:id> lub <a:name:id>)
    if (emoji.match(/^<a?:\w+:\d+>$/)) {
        return text.includes(emoji);
    }
    
    // Sprawdź Unicode emoji
    return text.includes(emoji);
}

// Funkcja do zamiany emoji w tekście
function replaceEmoji(text, oldEmoji, newEmoji) {
    // Globalna zamiana wszystkich wystąpień
    return text.replaceAll(oldEmoji, newEmoji);
}

// Funkcja do walidacji emoji
function isValidEmoji(emoji) {
    // Sprawdź czy to custom emoji Discord
    if (emoji.match(/^<a?:\w+:\d+>$/)) {
        return true;
    }
    
    // Sprawdź czy to Unicode emoji (podstawowa walidacja)
    const emojiRegex = /^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]$/u;
    return emojiRegex.test(emoji) || emoji.length === 1;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rename-emojis')
        .setDescription('Zamienia wybrane emoji na nowe w nazwach kanałów wybranej kategorii')
        .addStringOption(option =>
            option.setName('emoji-now')
                .setDescription('Obecne emoji do zamiany (np. 🎮 lub :emoji:)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('emoji-new')
                .setDescription('Nowe emoji (np. 🎯 lub :new_emoji:)')
                .setRequired(true))
        .addChannelOption(option =>
            option.setName('category')
                .setDescription('Kategoria kanałów do przetworzenia')
                .setRequired(true))
        .addBooleanOption(option =>
            option.setName('preview')
                .setDescription('Tylko podgląd zmian bez ich wykonania')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        
        const oldEmoji = interaction.options.getString('emoji-now');
        const newEmoji = interaction.options.getString('emoji-new');
        const category = interaction.options.getChannel('category');
        const preview = interaction.options.getBoolean('preview') ?? false;
        
        // Sprawdź czy wybrano kategorię
        if (category.type !== 4) { // ChannelType.GuildCategory
            await interaction.editReply('❌ **Błąd:** Musisz wybrać kategorię kanałów, nie zwykły kanał!');
            return;
        }
        
        // Walidacja emoji
        if (!isValidEmoji(oldEmoji)) {
            await interaction.editReply('❌ **Błąd:** Nieprawidłowe obecne emoji. Użyj pojedynczego emoji Unicode lub custom emoji Discord (:nazwa:)');
            return;
        }
        
        if (!isValidEmoji(newEmoji)) {
            await interaction.editReply('❌ **Błąd:** Nieprawidłowe nowe emoji. Użyj pojedynczego emoji Unicode lub custom emoji Discord (:nazwa:)');
            return;
        }
        
        if (oldEmoji === newEmoji) {
            await interaction.editReply('❌ **Błąd:** Obecne i nowe emoji są identyczne!');
            return;
        }
        
        try {
            const guild = interaction.guild;
            await guild.channels.fetch();
            
            // Znajdź wszystkie kanały w wybranej kategorii
            const channelsInCategory = guild.channels.cache.filter(channel => 
                channel.parentId === category.id
            );
            
            if (channelsInCategory.size === 0) {
                await interaction.editReply(`❌ **Brak kanałów w kategorii "${category.name}"!**`);
                return;
            }
            
            // Znajdź kanały zawierające stare emoji
            const channelsToRename = [];
            const channelsWithoutEmoji = [];
            const channelsAlreadyWithNewEmoji = [];
            
            channelsInCategory.forEach(channel => {
                const channelName = channel.name;
                
                if (containsEmoji(channelName, oldEmoji)) {
                    const newName = replaceEmoji(channelName, oldEmoji, newEmoji);
                    channelsToRename.push({
                        channel: channel,
                        oldName: channelName,
                        newName: newName
                    });
                } else if (containsEmoji(channelName, newEmoji)) {
                    channelsAlreadyWithNewEmoji.push(channelName);
                } else {
                    channelsWithoutEmoji.push(channelName);
                }
            });
            
            // Generuj raport
            let summary = `📊 **Analiza kanałów w kategorii "${category.name}"**\n\n`;
            summary += `🔍 **Znalezione emoji:**\n`;
            summary += `• Stare: ${oldEmoji}\n`;
            summary += `• Nowe: ${newEmoji}\n\n`;
            
            if (channelsToRename.length > 0) {
                summary += `✏️ **Kanały do zmiany (${channelsToRename.length}):**\n`;
                channelsToRename.slice(0, 10).forEach(change => {
                    summary += `• \`${change.oldName}\` → \`${change.newName}\`\n`;
                });
                if (channelsToRename.length > 10) {
                    summary += `• *...i ${channelsToRename.length - 10} więcej*\n`;
                }
                summary += '\n';
            }
            
            if (channelsAlreadyWithNewEmoji.length > 0) {
                summary += `✅ **Już zawierają nowe emoji (${channelsAlreadyWithNewEmoji.length}):**\n`;
                channelsAlreadyWithNewEmoji.slice(0, 5).forEach(name => {
                    summary += `• \`${name}\`\n`;
                });
                if (channelsAlreadyWithNewEmoji.length > 5) {
                    summary += `• *...i ${channelsAlreadyWithNewEmoji.length - 5} więcej*\n`;
                }
                summary += '\n';
            }
            
            if (channelsWithoutEmoji.length > 0) {
                summary += `❌ **Bez starego emoji (${channelsWithoutEmoji.length}):**\n`;
                channelsWithoutEmoji.slice(0, 5).forEach(name => {
                    summary += `• \`${name}\`\n`;
                });
                if (channelsWithoutEmoji.length > 5) {
                    summary += `• *...i ${channelsWithoutEmoji.length - 5} więcej*\n`;
                }
            }
            
            // Jeśli nie ma zmian do wykonania
            if (channelsToRename.length === 0) {
                summary += '\n✅ **Brak kanałów do zmiany!**';
                await interaction.editReply(summary);
                return;
            }
            
            // Jeśli to tylko podgląd
            if (preview) {
                summary += '\n⚠️ **To był tylko podgląd. Usuń opcję `preview` aby wykonać zmiany.**';
                await interaction.editReply(summary);
                return;
            }
            
            // Pokaż potwierdzenie przed wykonaniem zmian
            summary += '\n🚨 **UWAGA: Ta operacja jest nieodwracalna!**\n';
            summary += `Czy na pewno chcesz zmienić ${channelsToRename.length} kanałów?`;
            
            // Przyciski potwierdzenia
            const confirmButton = new ButtonBuilder()
                .setCustomId('confirm_rename')
                .setLabel(`🔄 TAK, ZMIEŃ ${channelsToRename.length} KANAŁÓW`)
                .setStyle(ButtonStyle.Danger);

            const cancelButton = new ButtonBuilder()
                .setCustomId('cancel_rename')
                .setLabel('❌ Anuluj')
                .setStyle(ButtonStyle.Secondary);

            const row = new ActionRowBuilder()
                .addComponents(confirmButton, cancelButton);

            const response = await interaction.editReply({
                content: summary,
                components: [row]
            });

            // Obsługa przycisków
            const collectorFilter = i => i.user.id === interaction.user.id;
            const collector = response.createMessageComponentCollector({ 
                filter: collectorFilter, 
                time: 60000 
            });

            collector.on('collect', async i => {
                if (i.customId === 'confirm_rename') {
                    await i.deferUpdate();
                    
                    let successCount = 0;
                    let errorCount = 0;
                    const errors = [];
                    
                    try {
                        await interaction.editReply({
                            content: '🔄 **Rozpoczynam zmianę nazw kanałów...**\n\nTo może potrwać kilka minut.',
                            components: []
                        });
                        
                        // Wykonaj zmiany
                        for (const change of channelsToRename) {
                            try {
                                // Sprawdź czy kanał nadal istnieje
                                const existingChannel = guild.channels.cache.get(change.channel.id);
                                if (existingChannel) {
                                    await existingChannel.setName(change.newName, `Zmiana emoji: ${oldEmoji} → ${newEmoji}`);
                                    successCount++;
                                    console.log(`✅ Zmieniono nazwę kanału: ${change.oldName} → ${change.newName}`);
                                } else {
                                    console.log(`⚠️ Kanał ${change.oldName} już nie istnieje`);
                                }
                                
                                // Przerwa żeby nie przekroczyć rate limit Discord API
                                await new Promise(resolve => setTimeout(resolve, 1000));
                                
                            } catch (error) {
                                errorCount++;
                                const errorMsg = `${change.oldName}: ${error.message}`;
                                errors.push(errorMsg);
                                console.error(`❌ Błąd zmiany nazwy kanału ${change.oldName}:`, error.message);
                            }
                        }
                        
                        // Podsumowanie wyników
                        let resultMessage = `✅ **Zmiana nazw zakończona!**\n\n`;
                        resultMessage += `📊 **Podsumowanie:**\n`;
                        resultMessage += `• Pomyślnie zmieniono: ${successCount} kanałów\n`;
                        
                        if (errorCount > 0) {
                            resultMessage += `• Błędy: ${errorCount} kanałów\n\n`;
                            resultMessage += `❌ **Szczegóły błędów:**\n`;
                            errors.slice(0, 5).forEach(error => {
                                resultMessage += `• ${error}\n`;
                            });
                            if (errors.length > 5) {
                                resultMessage += `• ...i ${errors.length - 5} więcej (sprawdź logi)\n`;
                            }
                        }
                        
                        resultMessage += `\n🔄 **Zamiana:** ${oldEmoji} → ${newEmoji}`;
                        resultMessage += `\n📁 **Kategoria:** ${category.name}`;
                        
                        await interaction.editReply({
                            content: resultMessage,
                            components: []
                        });
                        
                    } catch (error) {
                        console.error('Błąd podczas zamiany emoji:', error);
                        await interaction.editReply({
                            content: '❌ **Wystąpił krytyczny błąd podczas zmiany nazw!**\n\nSprawdź logi bota i spróbuj ponownie.',
                            components: []
                        });
                    }
                    
                } else if (i.customId === 'cancel_rename') {
                    await i.deferUpdate();
                    await interaction.editReply({
                        content: '❌ **Operacja anulowana.**\n\nŻadne nazwy kanałów nie zostały zmienione.',
                        components: []
                    });
                }
                
                collector.stop();
            });

            collector.on('end', collected => {
                if (collected.size === 0) {
                    interaction.editReply({
                        content: '⏰ **Czas na potwierdzenie minął.**\n\nOperacja została anulowana automatycznie.',
                        components: []
                    });
                }
            });
            
        } catch (error) {
            console.error('Błąd w rename-emojis:', error);
            await interaction.editReply('❌ Wystąpił błąd podczas pobierania danych serwera.');
        }
    }
};