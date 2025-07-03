const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');
const { Client, LocalAuth } = require('whatsapp-web.js');

// --- VARIÁVEIS GLOBAIS ---
let mainWindow;
let client;
let isBotBusy = false;
let MENSAGENS_BOT = {}; // Armazena as mensagens em memória para acesso rápido

// --- GESTÃO DE ARQUIVOS DE CONFIGURAÇÃO ---
const userDataPath = app.getPath('userData');
const messagesFilePath = path.join(userDataPath, 'mensagens.json');

function ensureMessagesFileExists() {
    if (!fs.existsSync(messagesFilePath)) {
        const sourcePath = path.join(__dirname, 'mensagens.json');
        try {
            fs.copyFileSync(sourcePath, messagesFilePath);
        } catch (error) {
            console.error('Falha ao copiar mensagens.json inicial:', error);
            dialog.showErrorBox('Erro Crítico', `Não foi possível criar o arquivo de configuração 'mensagens.json'.\n\nDetalhes: ${error.message}`);
            app.quit();
        }
    }
}

// --- LÓGICA DO CHATBOT INTEGRADA ---

function loadMessages() {
    try {
        const fileContent = fs.readFileSync(messagesFilePath, 'utf8');
        MENSAGENS_BOT = JSON.parse(fileContent); // Carrega as mensagens para a variável global
        return true;
    } catch (error) {
        console.error(`ERRO FATAL AO LER MENSAGENS: ${error.message}`);
        dialog.showErrorBox('Erro Crítico', `Não foi possível ler o arquivo 'mensagens.json'.\n\nDetalhes: ${error.message}`);
        app.quit();
        return false;
    }
}

const userStates = {};

function buildMenu(menuData) {
    let menuText = menuData.titulo ? `${menuData.titulo}\n\n` : '';
    for (const key in menuData.menu) {
        menuText += `${key} - ${menuData.menu[key].texto}\n`;
    }
    return menuText.trim();
}

async function handleAction(chat, action, contact) {
    const actionData = MENSAGENS_BOT[action];
    userStates[chat.id._serialized] = action;

    if (!actionData) {
        console.error(`Ação '${action}' não encontrada.`);
        return;
    }

    if (actionData.mensagens) {
        for (const message of actionData.mensagens) {
            if (message.delay) await new Promise(res => setTimeout(res, message.delay));
            await chat.sendStateTyping();
            if (message.tipo === 'texto') {
                let content = Array.isArray(message.conteudo) ? message.conteudo.join('\n') : message.conteudo;
                content = content.replace('{NOME_CLIENTE}', contact.pushname || 'amigo(a)');
                await client.sendMessage(chat.id._serialized, content);
            } else if (message.tipo === 'menu') {
                await client.sendMessage(chat.id._serialized, buildMenu(message.conteudo));
            }
        }
    } else {
        const name = contact.pushname || 'amigo(a)';
        const menuText = buildMenu(actionData).replace('{NOME_CLIENTE}', name.split(" ")[0]);
        await chat.sendStateTyping();
        await new Promise(res => setTimeout(res, 1000));
        await client.sendMessage(chat.id._serialized, menuText);
    }
}

// --- CONTROLO DO BOT ---

function startBotProcess() {
    if (isBotBusy || (client && client.pupPage)) {
        return;
    }

    if (!loadMessages()) return;

    isBotBusy = true;
    mainWindow.webContents.send('bot-status', 'starting');
    mainWindow.webContents.send('clear-output');
    mainWindow.webContents.send('bot-output', 'Iniciando o cliente do WhatsApp...\n');

    try {
        const puppeteer = require('puppeteer');
        
        client = new Client({
            authStrategy: new LocalAuth({ dataPath: path.join(userDataPath, 'wwebjs_auth') }),
            puppeteer: {
                executablePath: puppeteer.executablePath(),
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu'
                ],
            }
        });

        client.on('qr', qr => {
            mainWindow.webContents.send('qr-code', qr);
        });

        client.on('authenticated', () => {
            mainWindow.webContents.send('bot-authenticated');
        });

        client.on('ready', () => {
            isBotBusy = false;
            mainWindow.webContents.send('bot-status', 'iniciado');
            mainWindow.webContents.send('bot-output', 'Bot conectado e pronto para uso.\n');
        });

        client.on('disconnected', (reason) => {
            isBotBusy = false;
            mainWindow.webContents.send('bot-status', 'parado');
            mainWindow.webContents.send('bot-output', `\n>> O bot foi desconectado. Razão: ${reason} <<\n`);
            client = null;
        });

        client.on('auth_failure', (msg) => {
            isBotBusy = false;
            mainWindow.webContents.send('bot-status', 'parado');
            mainWindow.webContents.send('bot-output', `\n>> FALHA NA AUTENTICAÇÃO: ${msg} <<\n`);
            client = null;
        });

        client.on('message_create', async msg => {
            if (msg.fromMe || !msg.from.endsWith('@c.us')) return;

            const chat = await msg.getChat();
            const contact = await msg.getContact();
            const userInput = msg.body.trim().toLowerCase();
            const currentState = userStates[msg.from] || 'boasVindas';
            
            let currentActionData = MENSAGENS_BOT[currentState];
            let nextAction = null;

            if (currentActionData?.menu?.[userInput]) {
                nextAction = currentActionData.menu[userInput].acao;
            } 
            else if (['menu', 'oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'opa'].some(k => userInput.includes(k))) {
                nextAction = 'boasVindas';
            }

            if (nextAction) {
                await handleAction(chat, nextAction, contact);
                const finalActionData = MENSAGENS_BOT[nextAction];
                if (finalActionData && !finalActionData.menu) {
                    userStates[msg.from] = 'boasVindas';
                }
            }
        });

        mainWindow.webContents.send('bot-output', 'Inicializando conexão com o WhatsApp...\n');
        client.initialize().catch(err => {
            console.error('Erro no client.initialize:', err);
            dialog.showErrorBox('Erro de Inicialização', `Falha ao iniciar o cliente do WhatsApp.\n\nDetalhes: ${err.message}`);
            mainWindow.webContents.send('bot-output', `\n>> ERRO GRAVE AO INICIAR: ${err.message} <<\n`);
            mainWindow.webContents.send('bot-status', 'parado');
            isBotBusy = false;
            client = null;
        });

    } catch (err) {
        console.error('Erro crítico no bloco startBotProcess:', err);
        dialog.showErrorBox('Erro Crítico no Arranque', `Ocorreu um erro inesperado.\n\nDetalhes: ${err.message}\n\nStack: ${err.stack}`);
        mainWindow.webContents.send('bot-output', `\n>> ERRO CRÍTICO NO ARRANQUE: ${err.message} <<\n`);
        mainWindow.webContents.send('bot-status', 'parado');
        isBotBusy = false;
    }
}

async function stopBotProcess() {
    if (isBotBusy || !client) return Promise.resolve();
    isBotBusy = true;
    mainWindow.webContents.send('bot-status', 'stopping');
    mainWindow.webContents.send('bot-output', 'Desconectando o bot...\n');
    try {
        await client.destroy();
    } catch (e) {
        console.error("Erro ao destruir cliente", e)
    } finally {
        isBotBusy = false;
        client = null;
        mainWindow.webContents.send('bot-status', 'parado');
        mainWindow.webContents.send('bot-output', 'Bot parado com sucesso.\n');
    }
}

// --- LÓGICA DO ELECTRON (Janela, Menu, IPC) ---

function createMenu() {
    const menuTemplate = [
        {
            label: 'Arquivo',
            submenu: [
                {
                    label: 'Recarregar Painel',
                    accelerator: 'CmdOrCtrl+R',
                    click: () => mainWindow.reload()
                },
                { type: 'separator' },
                {
                    label: 'Sair',
                    accelerator: 'CmdOrCtrl+Q',
                    click: () => app.quit()
                }
            ]
        },
        {
            label: 'Ajuda',
            submenu: [
                {
                    label: 'Verificar Atualizações',
                    click: () => autoUpdater.checkForUpdatesAndNotify()
                },
                {
                    label: 'Ferramentas do Desenvolvedor',
                    accelerator: 'CmdOrCtrl+Shift+I',
                    click: () => mainWindow.webContents.openDevTools()
                }
            ]
        }
    ];
    const menu = Menu.buildFromTemplate(menuTemplate);
    Menu.setApplicationMenu(menu);
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 700,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        icon: path.join(__dirname, 'build/icon.png')
    });
    mainWindow.loadFile(path.join(__dirname, 'index.html'));

    mainWindow.once('ready-to-show', () => {
        autoUpdater.checkForUpdatesAndNotify();
    });
}

app.whenReady().then(() => {
    ensureMessagesFileExists();
    createWindow();
    createMenu();
});

app.on('window-all-closed', async () => {
    await stopBotProcess();
    if (process.platform !== 'darwin') app.quit();
});

ipcMain.on('start-bot', startBotProcess);
ipcMain.on('stop-bot', stopBotProcess);

ipcMain.on('clear-session', async () => {
    await stopBotProcess();
    const sessionPath = path.join(userDataPath, 'wwebjs_auth');
    
    if (fs.existsSync(sessionPath)) {
        try {
            fs.rmSync(sessionPath, { recursive: true, force: true });
            dialog.showMessageBox(mainWindow, {
                type: 'info',
                title: 'Sessão Limpa',
                message: 'A sessão do WhatsApp foi limpa com sucesso. O aplicativo será reiniciado.'
            }).then(() => {
                app.relaunch();
                app.quit();
            });
        } catch (error) {
            dialog.showErrorBox('Erro ao Limpar Sessão', `Não foi possível deletar a pasta da sessão.\n\nDetalhes: ${error.message}`);
        }
    } else {
        dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'Sessão Limpa',
            message: 'Nenhuma sessão ativa encontrada. O aplicativo será reiniciado.'
        }).then(() => {
            app.relaunch();
            app.quit();
        });
    }
});

ipcMain.handle('get-messages', async () => {
    return fs.readFileSync(messagesFilePath, 'utf8');
});

ipcMain.handle('save-messages', async (event, newMessagesString) => {
    try {
        const parsedJSON = JSON.parse(newMessagesString);
        mainWindow.webContents.send('clear-output');
        mainWindow.webContents.send('bot-output', 'Salvando mensagens e reiniciando o bot...\n');
        await stopBotProcess();
        fs.writeFileSync(messagesFilePath, JSON.stringify(parsedJSON, null, 2), 'utf8');
        MENSAGENS_BOT = parsedJSON; 
        await new Promise(resolve => setTimeout(resolve, 500));
        startBotProcess();
        return { success: true };
    } catch (error) {
        console.error("Erro ao salvar mensagens:", error);
        return { success: false, message: `Erro ao salvar o arquivo: ${error.message}` };
    }
});

ipcMain.on('exit-app', () => app.quit());