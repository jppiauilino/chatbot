const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

const getAssetPath = (assetName) => {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app.asar.unpacked', assetName);
  }
  return path.join(__dirname, assetName);
};

let mainWindow;
let botProcess = null;

// Função para iniciar o processo do bot
function startBotProcess() {
    // Limpa a tela antes de iniciar um novo processo
    if (mainWindow) {
        mainWindow.webContents.send('clear-output');
        mainWindow.webContents.send('bot-output', 'Iniciando o bot...');
    }
    
    const scriptPath = getAssetPath('chatbot.js');
    botProcess = spawn('node', [scriptPath]);
    
    mainWindow.webContents.send('bot-status', 'iniciado');
    
    botProcess.stdout.on('data', (data) => {
        mainWindow.webContents.send('bot-output', data.toString());
    });
    botProcess.stderr.on('data', (data) => {
        mainWindow.webContents.send('bot-output', `ERRO: ${data.toString()}`);
    });
    botProcess.on('close', () => {
        mainWindow.webContents.send('bot-output', '\n>> O bot foi parado. <<');
        mainWindow.webContents.send('bot-status', 'parado');
        botProcess = null;
    });
}

// Função para parar o processo do bot
function stopBotProcess() {
    return new Promise((resolve) => {
        if (botProcess) {
            botProcess.on('close', resolve);
            botProcess.kill();
            botProcess = null;
        } else {
            resolve();
        }
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 700,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });
    mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', async () => {
    if (process.platform !== 'darwin') {
        await stopBotProcess();
        app.quit();
    }
});

// Lógica dos botões
ipcMain.on('start-bot', startBotProcess);
ipcMain.on('stop-bot', stopBotProcess);

ipcMain.handle('get-messages', async () => {
    try {
        const messagesPath = getAssetPath('mensagens.json');
        return fs.readFileSync(messagesPath, 'utf8');
    } catch (error) {
        return `Erro ao ler o arquivo de mensagens: ${error.message}`;
    }
});

// Lógica para salvar as mensagens e reiniciar o bot de forma robusta
ipcMain.handle('save-messages', async (event, newMessages) => {
    try {
        const messagesPath = getAssetPath('mensagens.json');
        fs.writeFileSync(messagesPath, newMessages, 'utf8');
        
        mainWindow.webContents.send('clear-output');
        mainWindow.webContents.send('bot-output', 'Mensagens salvas! Reiniciando o bot...');

        // Para o bot e espera que ele termine antes de iniciar um novo
        await stopBotProcess();
        startBotProcess();
        
        return { success: true };
    } catch (error) {
        return { success: false, message: `Erro ao salvar o arquivo: ${error.message}` };
    }
});

ipcMain.on('exit-app', () => {
    app.quit();
});