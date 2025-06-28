const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

let mainWindow;
let botProcess = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });
    mainWindow.loadFile('index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        if (botProcess) botProcess.kill();
        app.quit();
    }
});

ipcMain.on('start-bot', () => {
    if (botProcess) return;
    botProcess = spawn('node', [path.join(__dirname, 'chatbot.js')]);
    mainWindow.webContents.send('bot-status', 'iniciado');
    botProcess.stdout.on('data', (data) => {
        mainWindow.webContents.send('bot-output', data.toString());
    });
    botProcess.stderr.on('data', (data) => {
        mainWindow.webContents.send('bot-output', `ERRO: ${data.toString()}`);
    });
    botProcess.on('close', () => {
        mainWindow.webContents.send('bot-output', '\n>> O bot foi interrompido <<');
        mainWindow.webContents.send('bot-status', 'parado');
        botProcess = null;
    });
});

ipcMain.on('stop-bot', () => {
    if (botProcess) {
        botProcess.kill();
    }
});

ipcMain.handle('get-messages', async () => {
    return fs.readFileSync(path.join(__dirname, 'mensagens.json'), 'utf8');
});

ipcMain.handle('save-messages', async (event, newMessages) => {
    fs.writeFileSync(path.join(__dirname, 'mensagens.json'), newMessages, 'utf8');
    return { success: true };
});

ipcMain.on('exit-app', () => {
    app.quit();
});