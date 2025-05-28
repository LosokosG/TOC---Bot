// bot.js - Główny plik bota Discord
const { Client, GatewayIntentBits, SlashCommandBuilder, AttachmentBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');
const { Canvas } = require('canvas');
const Table2canvas = require('table2canvas');
require('dotenv').config();

// Importuj komendę cleanup-categories
const cleanupCategories = require('./cleanup-categories');

// Importuj komendę channel-formatter
const channelFormatter = require('./channel-formatter');

// Importuj komendę rename-emojis
const renameEmojis = require('./rename-emojis');

// Tworzenie klienta Discord
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// URL do obrazka dividera
const DIVIDER_IMAGE_URL = 'https://i.ibb.co/0y7hHYqF/line-white.png';

// Maksymalna długość wiadomości Discord
const MAX_MESSAGE_LENGTH = 2000;

// Funkcja do podziału tekstu na części
function splitMessage(text, maxLength = MAX_MESSAGE_LENGTH) {
    const messages = [];
    let currentMessage = '';
    const lines = text.split('\n');
    let inCodeBlock = false;
    
    for (const line of lines) {
        // Sprawdź czy jesteśmy w bloku kodu
        if (line.startsWith('```')) {
            inCodeBlock = !inCodeBlock;
        }
        
        // Jeśli dodanie tej linii przekroczy limit
        if (currentMessage.length + line.length + 1 > maxLength) {
            // Jeśli jesteśmy w bloku kodu, zamknij go przed podziałem
            if (inCodeBlock && currentMessage) {
                currentMessage += '\n```';
                messages.push(currentMessage.trim());
                currentMessage = '```\n' + line;
            } else {
                if (currentMessage) {
                    messages.push(currentMessage.trim());
                    currentMessage = '';
                }
                
                // Jeśli pojedyncza linia jest za długa, podziel ją
                if (line.length > maxLength) {
                    const words = line.split(' ');
                    for (const word of words) {
                        if (currentMessage.length + word.length + 1 > maxLength) {
                            messages.push(currentMessage.trim());
                            currentMessage = word;
                        } else {
                            currentMessage += (currentMessage ? ' ' : '') + word;
                        }
                    }
                } else {
                    currentMessage = line;
                }
            }
        } else {
            currentMessage += (currentMessage ? '\n' : '') + line;
        }
    }
    
    if (currentMessage) {
        messages.push(currentMessage.trim());
    }
    
    return messages;
}

// Funkcja do parsowania tabeli markdown
function parseMarkdownTable(tableText) {
    const lines = tableText.trim().split('\n');
    if (lines.length < 3) return null; // Minimum: header, separator, one row
    
    // Parsuj nagłówki
    const headerLine = lines[0];
    const headers = headerLine.split('|')
        .map(h => h.trim().replace(/`/g, ''))
        .filter(h => h.length > 0);

    // Utwórz definicje kolumn dla table2canvas z dataIndex na podstawie nagłówków
    const columns = headers.map(header => ({
        title: header,
        dataIndex: header, // Używamy oryginalnego nagłówka jako dataIndex
        // Można dodać domyślne style kolumn, jeśli table2canvas to wspiera przez obiekt columns
        width: 150, // Przykładowa domyślna szerokość kolumny
        textAlign: 'left', // Przykładowe domyślne wyrównanie
        // Dodaj styl dla tekstu w kolumnie (biały kolor)
        textColor: '#FFFFFF', // Biały kolor tekstu w komórkach
    }));
    
    // Parsuj zawartość i utwórz dataSource jako tablicę obiektów dla table2canvas
    const dataSource = [];
    for (let i = 2; i < lines.length; i++) {
        const cells = lines[i].split('|')
            .map(c => c.trim().replace(/`/g, ''))
            .filter(c => c.length > 0);
        
        if (cells.length > 0) {
            const rowData = {};
            // Mapuj komórki do obiektu rowData używając nagłówków jako kluczy (dataIndex)
            headers.forEach((header, colIndex) => {
                let cellText = cells[colIndex] !== undefined ? cells[colIndex] : '';
                // Usuń znaczniki pogrubienia markdown (**tekst** -> tekst)
                cellText = cellText.replace(/\*\*(.*?)\*\*/g, '$1');
                // Można dodać obsługę innych formatowań markdown tutaj

                rowData[header] = cellText;
            });
            dataSource.push(rowData);
        }
    }
    
    // Zwróć dane w formacie oczekiwanym przez table2canvas: { columns: [], dataSource: [] }
    return { columns: columns, dataSource: dataSource }; // Zwracamy sparsowane columns i dataSource jako tablicę obiektów
}

// Funkcja do generowania obrazu tabeli za pomocą table2canvas
async function generateTableImage(tableData) {
    // Sprawdź, czy są dane do wyrenderowania (dataSource)
    if (!tableData || !tableData.dataSource || tableData.dataSource.length === 0) {
        console.log('Brak danych do wygenerowania obrazu tabeli (dataSource jest puste).');
        return null; // Zwróć null, jeśli brak danych
    }

    // Stwórz instancję Canvas z małym rozmiarem początkowym, zgodnie z przykładem table2canvas
    // table2canvas powinien sam dostosować rozmiar canvasu przy width/height: 'auto' (domyślne)
    const canvas = new Canvas(2, 2); // Używamy małego rozmiaru początkowego
    
    // Utwórz instancję Table2canvas i wyrenderuj tabelę
    const table = new Table2canvas({
        canvas: canvas, // Przekazujemy stworzony obiekt canvas
        dataSource: tableData.dataSource, // Przekazujemy dane tabeli (wiersze jako obiekty)
        columns: tableData.columns, // Przekazujemy definicje kolumn (z stylem tekstu)
        width: 800, // Ustaw stałą szerokość tabeli na 800 pikseli
        bgColor: '#00000000', // Ustaw przezroczyste tło (RGBA z alfa = 0)
        // text: '', // Nie używamy tytułu przekazywanego bezpośrednio do table2canvas
        style: { // Domyślne style komórek, jeśli nie określono inaczej w columns
             fontSize: '14px',
             fontFamily: 'sans-serif',
             borderColor: '#FFFFFF', // Biały kolor obramowania
             padding: 10,
             textAlign: 'left', // Domyślne wyrównanie tekstu
             columnWidth: 150, // Domyślna szerokość kolumny
             color: '#FFFFFF', // Biały kolor tekstu (domyślny dla wszystkich komórek)
             headerBgColor: '#313131FF', // Zachowaj ciemniejsze tło nagłówka (można zmienić na przezroczyste, jeśli wolisz)
             // Można dodać więcej opcji stylów globalnych/domyślnych z dokumentacji table2canvas TableStyle
         }
    });

    // table2canvas renderuje od razu po utworzeniu instancji na przekazanym canvasie
    // Obraz jest dostępny we właściwości .canvas instancji table
    const renderedCanvas = table.canvas;
    
    // Zwróć buffer obrazu (domyślnie PNG)
    return renderedCanvas.toBuffer();
}

// Funkcja do naprawy zduplikowanych linków
function fixDuplicateLinks(text) {
    // Napraw linki w formacie [URL](URL) gdzie oba URL są takie same
    // Zamień na samo URL, które Discord automatycznie zamieni na klikalny link
    return text.replace(/\[([^\[\]]+)\]\(\1\)/g, '$1');
}

// Funkcja do usuwania wiodących emoji
function removeLeadingEmoji(text) {
    // Prosty regex do usunięcia potencjalnych wiodących emoji i białych znaków
    // Może wymagać rozbudowy dla pełnego wsparcia wszystkich emoji unicode
    return text.replace(/^[\s\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}\u{200d}]+/u, '').trim();
}

// Funkcja do parsowania zawartości pliku - teraz wyodrębnia tytuły sekcji (usuwając emoji tylko dla spisu treści) i dzieli treść na części
function parseContent(content) {
    // Najpierw napraw zduplikowane linki w całej zawartości
    content = fixDuplicateLinks(content);
    
    // Podziel na sekcje - szukamy linii zawierających TYLKO "---" (plus ewentualne spacje)
    const lines = content.split('\n');
    const sections = [];
    let currentSectionLines = [];
    let sectionCounter = 1; // Licznik sekcji dla spisu treści
    
    for (const line of lines) {
        // Sprawdź czy linia zawiera tylko "---" (i ewentualne spacje)
        if (line.trim() === '---') {
            // Jeśli mamy zawartość sekcji, dodaj ją
            if (currentSectionLines.length > 0) {
                sections.push({ number: sectionCounter++, content: currentSectionLines.join('\n') });
                currentSectionLines = [];
            }
        } else {
            currentSectionLines.push(line);
        }
    }
    
    // Dodaj ostatnią sekcję
    if (currentSectionLines.length > 0) {
        sections.push({ number: sectionCounter++, content: currentSectionLines.join('\n') });
    }
    
    const parsedSections = [];
    console.log(`Znaleziono ${sections.length} sekcji`);
    
    // Regex do znajdowania tabel markdown
    const tableRegex = /(\|[^\n]+\|\n\|[-:\s|]+\|\n(?:\|[^\n]+\|\n?)+)/;
    
    for (const section of sections) {
        const sectionParts = [];
        let fullSectionContent = section.content; // Zachowujemy pełną zawartość sekcji
        let remainingText = section.content; // Kopia do przetwarzania części
        let currentTextPart = '';
        let sectionTitle = `Sekcja ${section.number}`; // Domyślny tytuł
        
        // Spróbuj znaleźć pierwszą linię w sekcji zawierającą nagłówek markdown i użyj jej jako tytułu
        const sectionLines = fullSectionContent.split('\n'); // Szukamy w pełnej zawartości
        for (const line of sectionLines) {
            const titleMatch = line.match(/^\s*(#+)\s*(.*)$/);
            if (titleMatch) {
                // Jeśli znaleziono linię z nagłówkiem, użyj reszty linii jako tytułu i usuń wiodące emoji TYLKO DLA TEGO TYTUŁU
                sectionTitle = removeLeadingEmoji(titleMatch[2].trim()); // Usunięcie wiodących emoji dla tytułu spisu treści
                // NIE usuwamy tej linii z remainingText, aby pozostała w treści sekcji
                break; // Znaleziono pierwszy nagłówek, przerywamy szukanie tytułu
            }
        }

        // Dziel sekcję na części tekstowe i tabelaryczne używając PEŁNEJ zawartości sekcji
        // Resetujemy remainingText na pełną zawartość, bo szukanie tytułu jej nie zmieniło
        remainingText = fullSectionContent;
        
        let match;
        while ((match = remainingText.match(tableRegex)) !== null) {
            const tableMatch = match[0];
            const tableIndex = match.index;
            
            // Dodaj tekst przed tabelą (jeśli istnieje)
            if (tableIndex > 0) {
                currentTextPart += (currentTextPart ? '\n' : '') + remainingText.substring(0, tableIndex).trim();
            }
            
            // Jeśli jest zgromadzony tekst przed tabelą, dodaj go jako część tekstową
            if (currentTextPart.length > 0) {
                sectionParts.push({ type: 'text', content: currentTextPart });
                currentTextPart = '';
            }
            
            // Sparsuj tabelę za pomocą parseMarkdownTable (teraz dla table2canvas)
            const parsedTableData = parseMarkdownTable(tableMatch); // parseMarkdownTable teraz zwraca { columns, dataSource } dla table2canvas
            if (parsedTableData && parsedTableData.dataSource && parsedTableData.dataSource.length > 0) { // Sprawdź czy są sparsowane dane i czy dataSource nie jest puste
                sectionParts.push({ type: 'table', data: parsedTableData });
            } else {
                 // Jeśli parsowanie tabeli się nie powiedzie lub brak danych, dodaj ją jako zwykły tekst w bloku kodu
                 sectionParts.push({ type: 'text', content: '```md\n' + tableMatch.trim() + '\n```' });
            }
            
            // Zaktualizuj pozostały tekst
            remainingText = remainingText.substring(tableIndex + tableMatch.length);
        }
        
        // Dodaj pozostały tekst po ostatniej tabeli (jeśli istnieje)
        if (remainingText.trim().length > 0) {
             currentTextPart += (currentTextPart ? '\n' : '') + remainingText.trim();
        }
        
        // Dodaj ostatnią część tekstową, jeśli istnieje
        if (currentTextPart.length > 0) {
            sectionParts.push({ type: 'text', content: currentTextPart });
        }
        
        parsedSections.push({ number: section.number, title: sectionTitle, parts: sectionParts }); // Użyj wyodrębnionego tytułu (bez wiodących emoji) dla spisu treści
    }
    
    return parsedSections;
}

// Event gdy bot jest gotowy
client.once('ready', async () => {
    console.log(`✅ Bot ${client.user.tag} jest online!`);
    
    // Rejestracja komend slash
    const commands = [
        new SlashCommandBuilder()
            .setName('toc')
            .setDescription('Publikuje Table of Contents na wybranym kanale')
            .addChannelOption(option =>
                option.setName('kanal')
                    .setDescription('Kanał do publikacji')
                    .setRequired(true))
            .addAttachmentOption(option =>
                option.setName('plik')
                    .setDescription('Plik .txt z zawartością')
                    .setRequired(true)),
        
        new SlashCommandBuilder()
            .setName('clear-toc')
            .setDescription('Usuwa wszystkie wiadomości bota z wybranego kanału')
            .addChannelOption(option =>
                option.setName('kanal')
                    .setDescription('Kanał do wyczyszczenia')
                    .setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    ];
    
    // Dodaj komendę cleanup-categories do listy
    commands.push(cleanupCategories.data);

    // Dodaj komendę channel-formatter do listy
    commands.push(channelFormatter.data);

    // Dodaj komendę rename-emojis do listy
    commands.push(renameEmojis.data);

    
    try {
        await client.application.commands.set(commands);
        console.log('✅ Komendy /toc i /clear-toc zostały zarejestrowane!');
    } catch (error) {
        console.error('❌ Błąd podczas rejestracji komend:', error);
    }
});

// Obsługa interakcji (komend slash)
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;
    
    // Komenda /toc
    if (interaction.commandName === 'toc') {
        await interaction.deferReply({ ephemeral: true });
        
        try {
            const channel = interaction.options.getChannel('kanal');
            const attachment = interaction.options.getAttachment('plik');
            
            // Sprawdź czy plik jest .txt
            if (!attachment.name.endsWith('.txt')) {
                await interaction.editReply('❌ Proszę przesłać plik .txt!');
                return;
            }
            
            // Pobierz zawartość pliku
            const response = await fetch(attachment.url);
            const content = await response.text();
            
            // Parsuj zawartość na sekcje i części (tekstowe/tabelaryczne)
            const sections = parseContent(content);
            const messageLinks = [];
            
            await interaction.editReply('📤 Rozpoczynam publikację Table of Contents...');
            
            // Wyślij każdą sekcję
            for (let i = 0; i < sections.length; i++) {
                const section = sections[i];
                
                let firstMessage = null; // Zapisz pierwszą wysłaną wiadomość dla linku

                // Przetwarzaj części sekcji
                for (const part of section.parts) {
                    if (part.type === 'text') {
                        // Wyślij części tekstowe jako osobne wiadomości
                        const textMessages = splitMessage(part.content);
                        for(const textMsg of textMessages) {
                             if (textMsg.trim().length > 0) { // Upewnij się, że wysyłamy tylko niepuste wiadomości
                                const msg = await channel.send(textMsg);
                                if (!firstMessage) firstMessage = msg;
                             }
                        }
                    } else if (part.type === 'table') {
                         // Generuj obraz tabeli i wyślij jako załącznik
                         try {
                             // generateTableImage teraz używa table2canvas i zwraca buffer
                             const imageBuffer = await generateTableImage(part.data);
                             if (imageBuffer) { // Sprawdź czy buffer obrazu został pomyślnie wygenerowany
                                 const attachment = new AttachmentBuilder(imageBuffer, { name: `table_section_${section.number}.png` });
                                 // Wysyłamy obraz tabeli jako osobną wiadomość
                                 await channel.send({ files: [attachment] });
                                 // Obrazy tabeli nie są liczone jako sekcje w spisie treści, więc nie aktualizujemy firstMessage tutaj
                             } else {
                                  // Jeśli generateTableImage zwróciło null (brak danych)
                                 const infoMsg = `ℹ️ Brak danych tabeli do wygenerowania obrazu w Sekcji ${section.number}.`;
                                 const msg = await channel.send(infoMsg);
                                  if (!firstMessage) firstMessage = msg; // Jeśli to pierwsza wiadomość w sekcji, zapisz ją dla linku
                             }
                         } catch (imageError) {
                             console.error('Błąd podczas generowania/wysyłania obrazu tabeli:\n', imageError);
                             // W razie błędu, wyślij informację o błędzie jako tekst
                             const errorMsg = `❌ Wystąpił błąd podczas generowania obrazu tabeli w Sekcji ${section.number}.`;
                             const msg = await channel.send(errorMsg);
                              if (!firstMessage) firstMessage = msg; // Jeśli to pierwsza wiadomość w sekcji, zapisz ją dla linku
                         }
                    }
                }

                // Zapisz link do pierwszej wiadomości sekcji (użyj jej wyodrębnionego tytułu)
                 if (firstMessage) {
                     messageLinks.push({
                         title: section.title, // Użyj wyodrębnionego tytułu sekcji
                         url: `https://discord.com/channels/${interaction.guildId}/${channel.id}/${firstMessage.id}`
                     });
                 } else if (section.parts.some(part => part.type === 'table')) {
                      // Jeśli sekcja zawierała tylko tabele i nie udało się wysłać żadnej wiadomości tekstowej (np. błąd generowania obrazu był pierwszą rzeczą)
                      // W tym przypadku, jeśli był jakikolwiek błąd przy generowaniu obrazu i nie było pierwszej wiadomości,
                      // powinniśmy już wysłać komunikat o błędzie, który zostanie potencjalnie zapisany jako firstMessage.
                      // Dodatkowe sprawdzenie, aby upewnić się, że coś zostało wysłane dla sekcji zawierającej tabele, jeśli firstMessage jest nadal null.
                       const hasTextParts = section.parts.some(part => part.type === 'text' && part.content.trim().length > 0);
                       if (!hasTextParts) {
                            // Jeśli sekcja zawierała tylko tabele i nie było żadnych części tekstowych,
                            // upewniamy się, że wysłano przynajmniej komunikat o błędzie, jeśli wystąpił
                            // Brak dodatkowego działania, bo błąd jest już obsługiwany wewnątrz pętli części.
                       }
                 }

                
                // Wyślij divider jako obrazek (pomiędzy sekcjami, nie po ostatniej)
                if (i < sections.length - 1) {
                    await channel.send(DIVIDER_IMAGE_URL);
                     // Mała przerwa między sekcjami
                    await new Promise(resolve => setTimeout(resolve, 1000)); // 1 sekunda przerwy
                }
                 // Mała przerwa po wysłaniu wszystkich części sekcji
                 await new Promise(resolve => setTimeout(resolve, 500)); // 0.5 sekundy przerwy
            }
            
            // Stwórz i wyślij spis treści
            if (messageLinks.length > 0) {
                 // Wyślij divider przed spisem treści
                 await channel.send(DIVIDER_IMAGE_URL);
                 await new Promise(resolve => setTimeout(resolve, 1000)); // Mała przerwa

                let tocMessage = '📚 **SPIS TREŚCI**\n\n';
                for (const link of messageLinks) {
                    // Formatuj linki jako nagłówki markdown drugiego poziomu
                    tocMessage += `## [${link.title}](${link.url})\n`; // Używa tytułu bez wiodących emoji
                }
                 // Upewnij się, że spis treści mieści się w jednej wiadomości lub go podziel
                const tocMessages = splitMessage(tocMessage);
                 for(const msg of tocMessages) {
                      await channel.send(msg);
                 }
            }

            
            await interaction.editReply('✅ Table of Contents został pomyślnie opublikowany!');
            
        } catch (error) {
            console.error('Błąd podczas przetwarzania komendy:\n', error);
            await interaction.editReply('❌ Wystąpił błąd podczas przetwarzania pliku.');
        }
    }
    
    // Komenda /clear-toc
    else if (interaction.commandName === 'clear-toc') {
        await interaction.deferReply({ ephemeral: true });
        
        try {
            const channel = interaction.options.getChannel('kanal');
            
            // Sprawdź uprawnienia
            if (!channel.permissionsFor(interaction.guild.members.me).has(PermissionFlagsBits.ManageMessages)) {
                await interaction.editReply('❌ Bot nie ma uprawnień do usuwania wiadomości na tym kanale!');
                return;
            }
            
            await interaction.editReply('🧹 Rozpoczynam usuwanie wiadomości bota...');
            
            let deleted = 0;
            let lastId = null;
            
            // Discord API pozwala pobrać max 100 wiadomości na raz
            while (true) {
                const options = { limit: 100 };
                if (lastId) options.before = lastId;
                
                const messages = await channel.messages.fetch(options);
                if (messages.size === 0) break;
                
                // Filtruj tylko wiadomości bota
                const botMessages = messages.filter(msg => msg.author.id === client.user.id);
                
                // Usuń wiadomości (bulk delete dla wiadomości < 14 dni)
                for (const msg of botMessages.values()) {
                    try {
                        await msg.delete();
                        deleted++;
                        // Mała przerwa żeby nie przekroczyć rate limit
                        await new Promise(resolve => setTimeout(resolve, 100));
                    } catch (err) {
                        console.error(`Nie można usunąć wiadomości ${msg.id}:`, err);
                    }
                }
                
                lastId = messages.last()?.id;
                
                // Jeśli było mniej niż 100 wiadomości, to koniec
                if (messages.size < 100) break;
            }
            
            await interaction.editReply(`✅ Usunięto ${deleted} wiadomości bota z kanału ${channel.name}`);
            
        } catch (error) {
            console.error('Błąd podczas czyszczenia kanału:', error);
            await interaction.editReply('❌ Wystąpił błąd podczas usuwania wiadomości.');
        }
    }
    
    // Komenda /cleanup-categories
    else if (interaction.commandName === 'cleanup-categories') {
        try {
            await cleanupCategories.execute(interaction);
        } catch (error) {
            console.error('Błąd podczas wykonywania komendy cleanup-categories:', error);
            if (interaction.deferred || interaction.replied) {
                await interaction.followUp({ content: '❌ Wystąpił błąd podczas wykonywania komendy cleanup-categories.', ephemeral: true });
            } else {
                await interaction.reply({ content: '❌ Wystąpił błąd podczas wykonywania komendy cleanup-categories.', ephemeral: true });
            }
        }
    }

    // Komenda /format-channels
    else if (interaction.commandName === 'format-channels') {
        try {
            await channelFormatter.execute(interaction);
        } catch (error) {
            console.error('Błąd podczas wykonywania komendy format-channels:', error);
            if (interaction.deferred || interaction.replied) {
                await interaction.followUp({ content: '❌ Wystąpił błąd podczas wykonywania komendy format-channels.', ephemeral: true });
            } else {
                await interaction.reply({ content: '❌ Wystąpił błąd podczas wykonywania komendy format-channels.', ephemeral: true });
            }
        }
    }

    // Komenda /rename-emojis
    else if (interaction.commandName === 'rename-emojis') {
        try {
            await renameEmojis.execute(interaction);
        } catch (error) {
            console.error('Błąd podczas wykonywania komendy rename-emojis:', error);
            if (interaction.deferred || interaction.replied) {
                await interaction.followUp({ content: '❌ Wystąpił błąd podczas wykonywania komendy rename-emojis.', ephemeral: true });
            } else {
                await interaction.reply({ content: '❌ Wystąpił błąd podczas wykonywania komendy rename-emojis.', ephemeral: true });
            }
        }
    }
});

// Logowanie bota
client.login(process.env.DISCORD_TOKEN);