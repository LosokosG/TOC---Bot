// cleanup-categories.js - Komenda do czyszczenia kategorii i kanałów
const { SlashCommandBuilder, PermissionFlagsBits, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('cleanup-categories')
        .setDescription('🚨 USUWA wszystkie kategorie i kanały które NIE zaczynają się lub NIE zawierają "╭──"')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    async execute(interaction) {
        // Sprawdź uprawnienia użytkownika
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply({ 
                content: '❌ **Błąd dostępu:** Ta komenda wymaga uprawnień administratora!', 
                ephemeral: true 
            });
            return;
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            // Pobierz wszystkie kategorie i kanały
            const guild = interaction.guild;
            await guild.channels.fetch();
            
            const categories = guild.channels.cache.filter(channel => 
                channel.type === 4 // ChannelType.GuildCategory
            );
            
            // Znajdź kategorie do usunięcia (które NIE zawierają "╭──")
            const categoriesToDelete = categories.filter(category => 
                !category.name.startsWith('╭──') && !category.name.includes('╭──')
            );
            
            // Znajdź kanały w tych kategoriach
            let channelsToDelete = [];
            categoriesToDelete.forEach(category => {
                const channelsInCategory = guild.channels.cache.filter(channel => 
                    channel.parentId === category.id
                );
                channelsToDelete = channelsToDelete.concat(Array.from(channelsInCategory.values()));
            });
            
            // NIE usuwamy kanałów bez kategorii - tylko te w kategoriach do usunięcia
            
            if (categoriesToDelete.size === 0 && channelsToDelete.length === 0) {
                await interaction.editReply('✅ **Brak elementów do usunięcia!**\n\nWszystkie kategorie już zawierają "╭──" w nazwie.');
                return;
            }

            // Pokaż podsumowanie
            let summary = '🚨 **OSTRZEŻENIE: NIEODWRACALNA OPERACJA!**\n\n';
            summary += '**Do usunięcia:**\n';
            
            if (categoriesToDelete.size > 0) {
                summary += `📁 **Kategorie (${categoriesToDelete.size}):**\n`;
                categoriesToDelete.forEach(cat => {
                    summary += `• ${cat.name}\n`;
                });
                summary += '\n';
            }
            
            if (channelsToDelete.length > 0) {
                summary += `💬 **Kanały w tych kategoriach (${channelsToDelete.length}):**\n`;
                channelsToDelete.slice(0, 10).forEach(ch => {
                    summary += `• #${ch.name}\n`;
                });
                if (channelsToDelete.length > 10) {
                    summary += `• ... i ${channelsToDelete.length - 10} więcej\n`;
                }
                summary += '\n';
            }
            
            summary += '**🛡️ Zostają zachowane:**\n';
            summary += '• Wszystkie kategorie zawierające "╭──"\n';
            summary += '• Wszystkie kanały w zachowanych kategoriach\n';
            summary += '• Wszystkie kanały bez kategorii\n\n';
            summary += '⚠️ **To działanie jest nieodwracalne!**';

            // Przyciski potwierdzenia
            const confirmButton = new ButtonBuilder()
                .setCustomId('confirm_cleanup')
                .setLabel('🗑️ TAK, USUŃ WSZYSTKO')
                .setStyle(ButtonStyle.Danger);

            const cancelButton = new ButtonBuilder()
                .setCustomId('cancel_cleanup')
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
                if (i.customId === 'confirm_cleanup') {
                    await i.deferUpdate();
                    
                    let deletedCount = 0;
                    let errors = 0;
                    
                    try {
                        await interaction.editReply({
                            content: '🔄 **Rozpoczynam usuwanie...**\n\nTo może potrwać kilka minut.',
                            components: []
                        });
                        
                        // Odśwież cache przed usuwaniem
                        await guild.channels.fetch();
                        
                        // Usuń kanały w kategoriach PRZED usunięciem kategorii
                        for (const channel of channelsToDelete) {
                            try {
                                // Sprawdź czy kanał nadal istnieje
                                const existingChannel = guild.channels.cache.get(channel.id);
                                if (existingChannel) {
                                    await existingChannel.delete('Cleanup kategorii - kanał w usuwanej kategorii');
                                    deletedCount++;
                                    console.log(`✅ Usunięto kanał: ${channel.name}`);
                                } else {
                                    console.log(`⚠️ Kanał ${channel.name} już nie istnieje`);
                                }
                                // Przerwa żeby nie przekroczyć rate limit
                                await new Promise(resolve => setTimeout(resolve, 500));
                            } catch (error) {
                                if (error.code === 10003) {
                                    // Unknown Channel - kanał już nie istnieje, to OK
                                    console.log(`⚠️ Kanał ${channel.name} już został usunięty`);
                                } else {
                                    console.error(`❌ Nie można usunąć kanału ${channel.name}:`, error.message);
                                    errors++;
                                }
                            }
                        }
                        
                        // Odśwież cache ponownie przed usuwaniem kategorii
                        await guild.channels.fetch();
                        
                        // Usuń kategorie NA KOŃCU (mogą być już puste)
                        for (const category of categoriesToDelete.values()) {
                            try {
                                // Sprawdź czy kategoria nadal istnieje
                                const existingCategory = guild.channels.cache.get(category.id);
                                if (existingCategory) {
                                    await existingCategory.delete('Cleanup kategorii - kategoria nie zawiera "╭──"');
                                    deletedCount++;
                                    console.log(`✅ Usunięto kategorię: ${category.name}`);
                                } else {
                                    console.log(`⚠️ Kategoria ${category.name} już nie istnieje`);
                                }
                                // Przerwa żeby nie przekroczyć rate limit
                                await new Promise(resolve => setTimeout(resolve, 500));
                            } catch (error) {
                                if (error.code === 10003) {
                                    // Unknown Channel - kategoria już nie istnieje, to OK
                                    console.log(`⚠️ Kategoria ${category.name} już została usunięta`);
                                } else {
                                    console.error(`❌ Nie można usunąć kategorii ${category.name}:`, error.message);
                                    errors++;
                                }
                            }
                        }
                        
                        let resultMessage = `✅ **Cleanup zakończony!**\n\n`;
                        resultMessage += `🗑️ **Usunięto:** ${deletedCount} elementów\n`;
                        if (errors > 0) {
                            resultMessage += `⚠️ **Błędy:** ${errors} elementów nie udało się usunąć (sprawdź logi)\n`;
                        }
                        resultMessage += `\n🛡️ **Zachowane kategorie:** Tylko te zawierające "╭──"`;
                        
                        await interaction.editReply({
                            content: resultMessage,
                            components: []
                        });
                        
                    } catch (error) {
                        console.error('Błąd podczas cleanup:', error);
                        await interaction.editReply({
                            content: '❌ **Wystąpił błąd podczas usuwania!**\n\nSprawdź logi bota i spróbuj ponownie.',
                            components: []
                        });
                    }
                    
                } else if (i.customId === 'cancel_cleanup') {
                    await i.deferUpdate();
                    await interaction.editReply({
                        content: '❌ **Operacja anulowana.**\n\nŻadne kategorie ani kanały nie zostały usunięte.',
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
            console.error('Błąd w cleanup-categories:', error);
            await interaction.editReply('❌ Wystąpił błąd podczas pobierania danych serwera.');
        }
    }
}; 