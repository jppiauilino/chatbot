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

startStopBtn.addEventListener('click', () => {
    if (isBotRunning) {
        ipcRenderer.send('stop-bot');
    } else {
        outputBox.textContent = 'Iniciando o bot...';
        ipcRenderer.send('start-bot');
    }
});

editBtn.addEventListener('click', async () => {
    const messages = await ipcRenderer.invoke('get-messages');
    messagesEditor.value = messages;
    mainView.classList.add('hidden');
    editorView.classList.remove('hidden');
});

saveBtn.addEventListener('click', async () => {
    await ipcRenderer.invoke('save-messages', messagesEditor.value);
    alert('Mensagens guardadas com sucesso!');
    editorView.classList.add('hidden');
    mainView.classList.remove('hidden');
});

cancelBtn.addEventListener('click', () => {
    editorView.classList.add('hidden');
    mainView.classList.remove('hidden');
});

exitBtn.addEventListener('click', () => {
    ipcRenderer.send('exit-app');
});

ipcRenderer.on('bot-output', (event, data) => {
    outputBox.textContent += data;
    outputBox.scrollTop = outputBox.scrollHeight;
});

ipcRenderer.on('bot-status', (event, status) => {
    if (status === 'iniciado') {
        isBotRunning = true;
        startStopBtn.textContent = '⏹️ Parar Bot';
        startStopBtn.style.backgroundColor = '#42b72a';
    } else {
        isBotRunning = false;
        startStopBtn.textContent = '▶️ Iniciar Bot';
        startStopBtn.style.backgroundColor = '#1877f2';
    }
});