const { app, BrowserWindow, ipcMain, dialog, Menu, net } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');
const { Client, LocalAuth } = require('whatsapp-web.js');

// --- VARIÁVEIS GLOBAIS ---
let mainWindow;
const clients = {
    bot1: { instance: null, status: 'parado', busy: false },
    bot2: { instance: null, status: 'parado', busy: false }
};
let MENSAGENS_BOT = {};

// ---ARQUIVOS DE CONFIGURAÇÃO ---
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
        MENSAGENS_BOT = JSON.parse(fileContent);
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

async function handleAction(chat, action, contact, clientInstance) {
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
                await clientInstance.sendMessage(chat.id._serialized, content);
            } else if (message.tipo === 'menu') {
                await clientInstance.sendMessage(chat.id._serialized, buildMenu(message.conteudo));
            }
        }
    } else {
        const name = contact.pushname || 'amigo(a)';
        const menuText = buildMenu(actionData).replace('{NOME_CLIENTE}', name.split(" ")[0]);
        await chat.sendStateTyping();
        await new Promise(res => setTimeout(res, 1000));
        await clientInstance.sendMessage(chat.id._serialized, menuText);
    }
}

// --- VERIFICAÇÃO DE LICENÇA (COM CORREÇÃO DE CAMINHO) ---
function verificarLicenca() {
    return new Promise((resolve, reject) => {
        // CORREÇÃO: Define o caminho base de forma robusta
        const basePath = app.isPackaged ? path.dirname(app.getPath('exe')) : __dirname;
        const licencaPath = path.join(basePath, 'licenca.json');

        if (!fs.existsSync(licencaPath)) {
            return reject(new Error(`Arquivo de licença não encontrado. Verificado em: ${licencaPath}`));
        }

        const licencaData = JSON.parse(fs.readFileSync(licencaPath, 'utf8'));
        const chave = licencaData.chave;

        if (!chave) {
            return reject(new Error('Chave de licença ausente no arquivo.'));
        }

        const corpoRequisicao = JSON.stringify({ chave_licenca: chave });

        const request = net.request({
            method: 'POST',
            protocol: 'https:',
            hostname: 'sua-api.onrender.com', // <-- MUDE AQUI PARA A URL DA SUA API
            path: '/api/verificar-licenca',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': corpoRequisicao.length
            }
        });

        request.on('response', (response) => {
            if (response.statusCode !== 200) {
                return reject(new Error(`Falha de comunicação com o servidor de licenças (Código: ${response.statusCode}).`));
            }
            
            let data = '';
            response.on('data', (chunk) => { data += chunk; });
            response.on('end', () => {
                try {
                    const resultado = JSON.parse(data);
                    resolve(resultado.status);
                } catch (e) {
                    reject(new Error('Resposta inválida do servidor de licenças.'));
                }
            });
        });
        request.on('error', (error) => reject(new Error(`Falha de conexão com o servidor de licenças: ${error.message}`)));
        request.write(corpoRequisicao);
        request.end();
    });
}


// --- CONTROLES DO BOT ---

async function startBotProcess(botId) {
    const bot = clients[botId];
    if (bot.busy || bot.instance) return;

    try {
        const statusLicenca = await verificarLicenca();
        if (statusLicenca !== 'ativo') {
            const mensagemErro = `SEU PAGAMENTO EXPIROU, contate +55 88 98221-7572 para mais informações`;
            mainWindow.webContents.send('bot-licence-expired', { botId, message: mensagemErro });
            dialog.showErrorBox('Assinatura Inválida', 'Sua assinatura do bot expirou ou não foi encontrada. Por favor, entre em contato com o suporte para regularizar a sua situação.');
            return;
        }
    } catch (error) {
        mainWindow.webContents.send('bot-output', { botId, data: `ERRO DE LICENÇA: ${error.message}\n` });
        dialog.showErrorBox('Erro de Licença', error.message);
        mainWindow.webContents.send('bot-status', { botId, status: 'parado' });
        return;
    }
    
    if (!loadMessages()) return;

    bot.busy = true;
    mainWindow.webContents.send('bot-status', { botId, status: 'starting' });
    mainWindow.webContents.send('clear-output', { botId });
    mainWindow.webContents.send('bot-output', { botId, data: 'Iniciando o cliente do WhatsApp...\n' });

    try {
        const puppeteer = require('puppeteer');
        
        const clientInstance = new Client({
            authStrategy: new LocalAuth({ dataPath: path.join(userDataPath, 'wwebjs_auth', botId) }),
            puppeteer: {
                executablePath: puppeteer.executablePath(),
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-accelerated-2d-canvas', '--no-first-run', '--no-zygote', '--disable-gpu'],
            }
        });
        
        clients[botId].instance = clientInstance;

        clientInstance.on('qr', qr => mainWindow.webContents.send('qr-code', { botId, qr }));
        clientInstance.on('authenticated', () => mainWindow.webContents.send('bot-authenticated', { botId }));

        clientInstance.on('ready', () => {
            bot.busy = false;
            bot.status = 'iniciado';
            mainWindow.webContents.send('bot-status', { botId, status: 'iniciado' });
            mainWindow.webContents.send('bot-output', { botId, data: 'Bot conectado e pronto para uso.\n' });

            setInterval(async () => {
                try {
                    const status = await verificarLicenca();
                    if (status !== 'ativo') {
                        const mensagemErro = `SEU PAGAMENTO EXPIROU, contate +55 88 98221-7572 para mais informações`;
                        mainWindow.webContents.send('bot-licence-expired', { botId, message: mensagemErro });
                        await stopBotProcess(botId);
                        dialog.showErrorBox('Assinatura Expirada', `Sua assinatura para o ${botId} expirou e ele foi desconectado.`);
                    }
                } catch (error) {
                    console.error(`Erro na verificação periódica da licença para ${botId}:`, error);
                }
            }, 12 * 60 * 60 * 1000); // A cada 12 horas
        });

        clientInstance.on('disconnected', (reason) => {
            bot.busy = false;
            bot.status = 'parado';
            bot.instance = null;
            mainWindow.webContents.send('bot-status', { botId, status: 'parado' });
            mainWindow.webContents.send('bot-output', { botId, data: `\n>> O bot foi desconectado. Razão: ${reason} <<\n` });
        });

        clientInstance.on('auth_failure', (msg) => {
            bot.busy = false;
            bot.status = 'parado';
            bot.instance = null;
            mainWindow.webContents.send('bot-status', { botId, status: 'parado' });
            mainWindow.webContents.send('bot-output', { botId, data: `\n>> FALHA NA AUTENTICAÇÃO: ${msg} <<\n` });
        });

        clientInstance.on('message_create', async msg => {
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
            else if (userInput === '0') {
                nextAction = 'boasVindas';
            }
            else if (['menu', 'oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'opa'].some(k => userInput.includes(k))) {
                nextAction = 'boasVindas';
            }

            if (nextAction) {
                await handleAction(chat, nextAction, contact, clientInstance);
                const finalActionData = MENSAGENS_BOT[nextAction];
                if (finalActionData && !finalActionData.menu) {
                    userStates[msg.from] = 'boasVindas';
                }
            }
        });

        mainWindow.webContents.send('bot-output', { botId, data: 'Inicializando conexão com o WhatsApp...\n' });
        clientInstance.initialize().catch(err => {
            console.error(`Erro no client.initialize para ${botId}:`, err);
            dialog.showErrorBox('Erro de Inicialização', `Falha ao iniciar o cliente do WhatsApp para ${botId}.\n\nDetalhes: ${err.message}`);
            mainWindow.webContents.send('bot-output', { botId, data: `\n>> ERRO GRAVE AO INICIAR: ${err.message} <<\n` });
            bot.busy = false;
            bot.status = 'parado';
            bot.instance = null;
            mainWindow.webContents.send('bot-status', { botId, status: 'parado' });
        });

    } catch (err) {
        console.error(`Erro crítico no startBotProcess para ${botId}:`, err);
        dialog.showErrorBox('Erro Crítico no Arranque', `Ocorreu um erro inesperado.\n\nDetalhes: ${err.message}\n\nStack: ${err.stack}`);
        clients[botId].busy = false;
        clients[botId].status = 'parado';
        mainWindow.webContents.send('bot-status', { botId, status: 'parado' });
    }
}

async function stopBotProcess(botId) {
    const bot = clients[botId];
    if (bot.busy || !bot.instance) return Promise.resolve();
    
    bot.busy = true;
    mainWindow.webContents.send('bot-status', { botId, status: 'stopping' });
    mainWindow.webContents.send('bot-output', { botId, data: 'Desconectando o bot...\n' });
    try {
        await bot.instance.destroy();
    } catch (e) {
        console.error(`Erro ao destruir cliente ${botId}`, e)
    } finally {
        bot.busy = false;
        bot.instance = null;
        bot.status = 'parado';
        mainWindow.webContents.send('bot-status', { botId, status: 'parado' });
        mainWindow.webContents.send('bot-output', { botId, data: 'Bot parado com sucesso.\n' });
    }
}

// --- Funções do Electron ---

function createMenu() {
    const menuTemplate = [
        { label: 'Arquivo', submenu: [{ label: 'Recarregar Painel', accelerator: 'CmdOrCtrl+R', click: () => mainWindow.reload() }, { type: 'separator' }, { label: 'Sair', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() }] },
        { label: 'Ajuda', submenu: [{ label: 'Verificar Atualizações', click: () => autoUpdater.checkForUpdatesAndNotify() }, { label: 'Ferramentas do Desenvolvedor', accelerator: 'CmdOrCtrl+Shift+I', click: () => mainWindow.webContents.openDevTools() }] }
    ];
    const menu = Menu.buildFromTemplate(menuTemplate);
    Menu.setApplicationMenu(menu);
}

function createWindow() {
    mainWindow = new BrowserWindow({ width: 1200, height: 700, webPreferences: { nodeIntegration: true, contextIsolation: false }, icon: path.join(__dirname, 'build/icon.png') });
    mainWindow.loadFile(path.join(__dirname, 'index.html'));
    mainWindow.once('ready-to-show', () => autoUpdater.checkForUpdatesAndNotify());
}

app.whenReady().then(() => {
    ensureMessagesFileExists();
    createWindow();
    createMenu();
});

app.on('window-all-closed', async () => {
    await stopBotProcess('bot1');
    await stopBotProcess('bot2');
    if (process.platform !== 'darwin') app.quit();
});

// --- Comunicação IPC ---

ipcMain.on('start-bot', (event, { botId }) => startBotProcess(botId));
ipcMain.on('stop-bot', (event, { botId }) => stopBotProcess(botId));

ipcMain.on('clear-session', async (event, { botId }) => {
    await stopBotProcess(botId);
    const sessionPath = path.join(userDataPath, 'wwebjs_auth', botId);
    
    if (fs.existsSync(sessionPath)) {
        try {
            fs.rmSync(sessionPath, { recursive: true, force: true });
            dialog.showMessageBox(mainWindow, { type: 'info', title: `Sessão Limpa - ${botId}`, message: `A sessão do WhatsApp para ${botId} foi limpa com sucesso. Por favor, reinicie o bot.` });
            mainWindow.webContents.send('bot-status', { botId, status: 'parado' });
            mainWindow.webContents.send('clear-output', { botId });
        } catch (error) {
            dialog.showErrorBox('Erro ao Limpar Sessão', `Não foi possível deletar a pasta da sessão para ${botId}.\n\nDetalhes: ${error.message}`);
        }
    } else {
        dialog.showMessageBox(mainWindow, { type: 'info', title: 'Sessão Limpa', message: `Nenhuma sessão ativa encontrada para ${botId}.` });
    }
});

ipcMain.handle('get-messages', async () => fs.readFileSync(messagesFilePath, 'utf8'));

ipcMain.handle('save-messages', async (event, newMessagesString) => {
    try {
        const parsedJSON = JSON.parse(newMessagesString);
        mainWindow.webContents.send('clear-output', { botId: 'bot1' });
        mainWindow.webContents.send('clear-output', { botId: 'bot2' });
        mainWindow.webContents.send('bot-output', { botId: 'bot1', data: 'Salvando mensagens e reiniciando o bot...\n' });
        mainWindow.webContents.send('bot-output', { botId: 'bot2', data: 'Salvando mensagens e reiniciando o bot...\n' });
        
        await stopBotProcess('bot1');
        await stopBotProcess('bot2');
        
        fs.writeFileSync(messagesFilePath, JSON.stringify(parsedJSON, null, 2), 'utf8');
        MENSAGENS_BOT = parsedJSON; 
        
        await new Promise(resolve => setTimeout(resolve, 500));
        
        return { success: true };
    } catch (error) {
        console.error("Erro ao salvar mensagens:", error);
        return { success: false, message: `Erro ao salvar o arquivo: ${error.message}` };
    }
});

ipcMain.on('exit-app', () => app.quit());