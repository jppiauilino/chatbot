const { ipcRenderer } = require('electron');

const startStopBtn = document.getElementById('start-stop-btn');
const outputBox = document.getElementById('output-box');
const editBtn = document.getElementById('edit-btn');
const exitBtn = document.getElementById('exit-btn');
const mainView = document.getElementById('main-view');
const editorView = document.getElementById('editor-view');
const messagesEditor = document.getElementById('messages-editor');
const saveBtn = document.getElementById('save-btn');
const cancelBtn = document.getElementById('cancel-btn');

let isBotRunning = false;

// Funções para controlar a visibilidade das telas
function showMainView() {
    editorView.classList.add('hidden');
    mainView.classList.remove('hidden');
}

function showEditorView() {
    mainView.classList.add('hidden');
    editorView.classList.remove('hidden');
}

startStopBtn.addEventListener('click', () => {
    if (isBotRunning) {
        ipcRenderer.send('stop-bot');
    } else {
        ipcRenderer.send('start-bot');
    }
});

editBtn.addEventListener('click', async () => {
    const messages = await ipcRenderer.invoke('get-messages');
    messagesEditor.value = messages;
    showEditorView();
});

saveBtn.addEventListener('click', async () => {
    // Mostra a tela principal imediatamente e dá feedback
    showMainView();
    const result = await ipcRenderer.invoke('save-messages', messagesEditor.value);
    if (!result.success) {
        // Se houver um erro, exibe-o no console
        outputBox.textContent = `ERRO AO SALVAR: ${result.message}`;
    }
});

cancelBtn.addEventListener('click', () => {
    showMainView();
});

exitBtn.addEventListener('click', () => {
    ipcRenderer.send('exit-app');
});

// Eventos recebidos do main.js
ipcRenderer.on('clear-output', () => {
    outputBox.textContent = '';
});

ipcRenderer.on('bot-output', (event, data) => {
    outputBox.textContent += data;
    outputBox.scrollTop = outputBox.scrollHeight;
});

ipcRenderer.on('bot-status', (event, status) => {
    if (status === 'iniciado') {
        isBotRunning = true;
        startStopBtn.textContent = '⏹️ Parar Bot';
        startStopBtn.style.backgroundColor = 'var(--success-green)';
    } else {
        isBotRunning = false;
        startStopBtn.textContent = '▶️ Iniciar Bot';
        startStopBtn.style.backgroundColor = 'var(--primary-blue)';
    }
});