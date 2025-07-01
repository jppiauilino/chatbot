const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

// Função para obter o caminho correto dos assets, tanto em desenvolvimento quanto empacotado
const getAssetPath = (assetName) => {
  if (app.isPackaged) {
    // No modo empacotado, os arquivos descompactados ficam em 'app.asar.unpacked'
    return path.join(process.resourcesPath, 'app.asar.unpacked', assetName);
  }
  return path.join(__dirname, assetName);
};

let mainWindow;
let botProcess = null;
let isBotBusy = false; // Flag para controlar operações concorrentes

// Função para iniciar o processo do bot
function startBotProcess() {
    if (isBotBusy || botProcess) {
        console.log('Operação já em andamento ou bot já iniciado.');
        return;
    }
    
    isBotBusy = true;
    mainWindow.webContents.send('bot-status', 'starting');

    if (mainWindow) {
        mainWindow.webContents.send('clear-output');
    }
    
    const scriptPath = getAssetPath('chatbot.js');
    // Adiciona 'ipc' ao stdio para permitir a comunicação entre processos
    botProcess = spawn('node', [scriptPath], { stdio: ['pipe', 'pipe', 'pipe', 'ipc'] });
    
    // Escuta mensagens do processo filho (chatbot.js)
    botProcess.on('message', (message) => {
        if (message.type === 'qr') {
            mainWindow.webContents.send('qr-code', message.data);
        }
        if (message.type === 'authenticated') {
            mainWindow.webContents.send('bot-authenticated');
        }
    });

    botProcess.stdout.on('data', (data) => {
        mainWindow.webContents.send('bot-output', data.toString());
    });
    botProcess.stderr.on('data', (data) => {
        mainWindow.webContents.send('bot-output', `ERRO: ${data.toString()}`);
    });
    botProcess.on('close', (code) => {
        const message = code === 1 ? '>> O bot foi parado devido a um erro. Verifique o console. <<' : '>> O bot foi parado. <<';
        if (mainWindow) {
            mainWindow.webContents.send('bot-output', `\n${message}\n`);
            mainWindow.webContents.send('bot-status', 'parado');
        }
        botProcess = null;
        isBotBusy = false;
    });
    
    mainWindow.webContents.send('bot-status', 'iniciado');
    isBotBusy = false;
}

// Função para parar o processo do bot
function stopBotProcess() {
    return new Promise((resolve) => {
        if (isBotBusy || !botProcess) {
            if (!botProcess) resolve();
            return;
        }
        isBotBusy = true;
        mainWindow.webContents.send('bot-status', 'stopping');

        botProcess.on('close', () => {
            botProcess = null;
            isBotBusy = false;
            resolve();
        });

        // Envia uma mensagem para o processo filho para um encerramento gracioso
        botProcess.send('shutdown');

        // Fallback para forçar o encerramento após um timeout
        setTimeout(() => {
            if(botProcess) {
                botProcess.kill('SIGKILL');
            }
        }, 3000);
    });
}


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
    createWindow();
    createMenu();
});

app.on('window-all-closed', async () => {
    if (process.platform !== 'darwin') {
        await stopBotProcess();
        app.quit();
    }
});

// --- Lógica de Comunicação com a Interface (IPC) ---

ipcMain.on('start-bot', startBotProcess);
ipcMain.on('stop-bot', stopBotProcess);

ipcMain.handle('get-messages', async () => {
    try {
        const messagesPath = getAssetPath('mensagens.json');
        return fs.readFileSync(messagesPath, 'utf8');
    } catch (error) {
        dialog.showErrorBox('Erro de Leitura', `Não foi possível ler o arquivo de mensagens: ${error.message}`);
        return `Erro ao ler o arquivo de mensagens: ${error.message}`;
    }
});

ipcMain.handle('save-messages', async (event, newMessagesString) => {
    if (isBotBusy) {
        return { success: false, message: 'Aguarde a operação atual do bot ser concluída.' };
    }
    
    const messagesPath = getAssetPath('mensagens.json');
    
    try {
        mainWindow.webContents.send('bot-status', 'restarting');
        mainWindow.webContents.send('clear-output');
        mainWindow.webContents.send('bot-output', 'Mensagens salvas! Reiniciando o bot...');

        await stopBotProcess();
        
        fs.writeFileSync(messagesPath, newMessagesString, 'utf8');
        
        startBotProcess();
        
        return { success: true };
    } catch (error) {
        return { success: false, message: `Erro ao salvar o arquivo: ${error.message}` };
    }
});

ipcMain.on('exit-app', async () => {
    await stopBotProcess();
    app.quit();
});