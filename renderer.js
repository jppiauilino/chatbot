const { ipcRenderer } = require('electron');
const qrcode = require('qrcode');

// --- Elementos da UI ---
const editBtn = document.getElementById('edit-btn');
const exitBtn = document.getElementById('exit-btn');
const mainView = document.getElementById('main-view');
const editorView = document.getElementById('editor-view');
const editorNav = document.getElementById('editor-nav');
const editorContent = document.getElementById('editor-content');
const saveBtn = document.getElementById('save-btn');
const cancelBtn = document.getElementById('cancel-btn');
const toastContainer = document.getElementById('toast-container');

let originalMessages = {};

// --- Funções Auxiliares da UI ---
function showMainView() {
    editorView.classList.add('hidden');
    mainView.classList.remove('hidden');
}

function showEditorView() {
    mainView.classList.add('hidden');
    editorView.classList.remove('hidden');
}

function setGlobalButtonsEnabled(enabled) {
    editBtn.disabled = !enabled;
    exitBtn.disabled = !enabled;
}

function setBotButtonsEnabled(botId, enabled) {
    const startStopBtn = document.getElementById(`start-stop-btn-${botId}`);
    const clearSessionBtn = document.getElementById(`clear-session-btn-${botId}`);
    if(startStopBtn) startStopBtn.disabled = !enabled;
    if(clearSessionBtn) clearSessionBtn.disabled = !enabled;
}

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => {
        toast.remove();
    }, 5000);
}

// --- Editor Visual ---

function formatLabel(key) {
    return key.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim();
}

function buildFormFields(container, data, parentPath) {
    for (const key in data) {
        const value = data[key];
        const currentPath = `${parentPath}.${key}`;

        if (key === 'titulo' && typeof value === 'string') {
            const group = document.createElement('div');
            group.className = 'form-group';
            const label = document.createElement('label');
            label.textContent = "Título / Mensagem Principal";
            group.appendChild(label);
            const desc = document.createElement('p');
            desc.className = 'description';
            desc.textContent = 'A primeira mensagem que o usuário vê nesta etapa.';
            group.appendChild(desc);
            const textarea = document.createElement('textarea');
            textarea.value = value;
            textarea.addEventListener('input', (e) => {
                setNestedValue(originalMessages, currentPath, e.target.value);
            });
            group.appendChild(textarea);
            container.appendChild(group);
        }

        if (key === 'menu' && typeof value === 'object' && value !== null) {
            for (const menuKey in value) {
                const menuItem = value[menuKey];
                const menuItemPath = `${currentPath}.${menuKey}.texto`;
                const group = document.createElement('div');
                group.className = 'form-group';
                const label = document.createElement('label');
                label.textContent = `Texto da Opção ${menuKey}`;
                group.appendChild(label);
                const input = document.createElement('input');
                input.type = 'text';
                input.value = menuItem.texto;
                input.addEventListener('input', (e) => {
                    setNestedValue(originalMessages, menuItemPath, e.target.value);
                });
                group.appendChild(input);
                container.appendChild(group);
            }
        }
        
        if (key === 'mensagens' && Array.isArray(value)) {
            value.forEach((msg, index) => {
                const msgPath = `${currentPath}.${index}`;
                if (msg.tipo === 'texto') {
                    const contentPath = `${msgPath}.conteudo`;
                    const group = document.createElement('div');
                    group.className = 'form-group';
                    const label = document.createElement('label');
                    label.textContent = value.length > 1 ? `Bloco de Texto ${index + 1}` : 'Conteúdo da Resposta';
                    group.appendChild(label);
                    const textarea = document.createElement('textarea');
                    const contentValue = Array.isArray(msg.conteudo) ? msg.conteudo.join('\n') : msg.conteudo;
                    const isArray = Array.isArray(msg.conteudo);
                    textarea.value = contentValue;
                    textarea.addEventListener('input', (e) => {
                        const newValue = isArray ? e.target.value.split('\n') : e.target.value;
                        setNestedValue(originalMessages, contentPath, newValue);
                    });
                    group.appendChild(textarea);
                    container.appendChild(group);
                }
                else if (msg.tipo === 'menu' && msg.conteudo) {
                    buildFormFields(container, msg.conteudo, `${msgPath}.conteudo`);
                }
            });
        }
    }
}

// ESTA É A FUNÇÃO CORRIGIDA
function setNestedValue(obj, path, value) {
    const keys = path.split('.');
    let current = obj;
    // O ciclo agora começa em i = 0 para percorrer o caminho completo
    for (let i = 0; i < keys.length - 1; i++) {
        if (current[keys[i]] === undefined) {
            console.error("Caminho inválido em setNestedValue:", path);
            return;
        }
        current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = value;
}

function displayCategoryForm(categoryKey) {
    editorContent.innerHTML = '';
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.key === categoryKey);
    });
    const categoryData = originalMessages[categoryKey];
    if (categoryData) {
        // Passamos o objeto da categoria específica, mas o caminho começa na raiz
        buildFormFields(editorContent, categoryData, categoryKey);
    }
}

function populateVisualEditor(messagesString) {
    editorNav.innerHTML = '';
    editorContent.innerHTML = '';
    try {
        originalMessages = JSON.parse(messagesString);
        Object.keys(originalMessages).forEach(key => {
            const navItem = document.createElement('div');
            navItem.className = 'nav-item';
            navItem.textContent = formatLabel(key);
            navItem.dataset.key = key;
            navItem.addEventListener('click', () => displayCategoryForm(key));
            editorNav.appendChild(navItem);
        });
        if (editorNav.firstChild) {
            displayCategoryForm(editorNav.firstChild.dataset.key);
        }
    } catch (error) {
        showToast(`Erro ao processar o JSON de mensagens: ${error.message}`, 'error');
        console.error(error);
    }
}

// --- O RESTO DO FICHEIRO CONTINUA IGUAL ---

// --- Event Listeners dos Botões ---
document.querySelectorAll('[id^="start-stop-btn-"]').forEach(btn => {
    btn.addEventListener('click', () => {
        const botId = btn.dataset.botId;
        const isBotRunning = btn.dataset.status === 'iniciado';
        ipcRenderer.send(isBotRunning ? 'stop-bot' : 'start-bot', { botId });
    });
});
document.querySelectorAll('[id^="clear-session-btn-"]').forEach(btn => {
    btn.addEventListener('click', () => {
        const botId = btn.dataset.botId;
        ipcRenderer.send('clear-session', { botId });
    });
});
editBtn.addEventListener('click', async () => {
    try {
        const messages = await ipcRenderer.invoke('get-messages');
        populateVisualEditor(messages);
        showEditorView();
    } catch (error) {
        showToast(`Erro ao carregar mensagens: ${error.message}`, 'error');
    }
});
saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    cancelBtn.disabled = true;
    saveBtn.textContent = 'Salvando...';
    const newMessagesString = JSON.stringify(originalMessages, null, 2);
    const result = await ipcRenderer.invoke('save-messages', newMessagesString);
    if (result.success) {
        showMainView();
        showToast('Mensagens salvas com sucesso!');
    } else {
        showToast(`ERRO AO SALVAR: ${result.message}`, 'error');
    }
    saveBtn.disabled = false;
    cancelBtn.disabled = false;
    saveBtn.textContent = 'Salvar Alterações';
});
cancelBtn.addEventListener('click', () => {
    showMainView();
});
exitBtn.addEventListener('click', () => {
    ipcRenderer.send('exit-app');
});

// --- Handlers de Eventos IPC ---
ipcRenderer.on('clear-output', (event, { botId }) => {
    const outputBox = document.getElementById(`output-box-${botId}`);
    const qrcodeContainer = document.getElementById(`qrcode-container-${botId}`);
    outputBox.textContent = '';
    qrcodeContainer.innerHTML = '';
    qrcodeContainer.style.display = 'none';
});
ipcRenderer.on('bot-output', (event, { botId, data }) => {
    const outputBox = document.getElementById(`output-box-${botId}`);
    if (outputBox.textContent.startsWith('O bot está inativo.')) outputBox.textContent = '';
    outputBox.textContent += data;
    outputBox.scrollTop = outputBox.scrollHeight;
});
ipcRenderer.on('qr-code', (event, { botId, qr }) => {
    const outputBox = document.getElementById(`output-box-${botId}`);
    const qrcodeContainer = document.getElementById(`qrcode-container-${botId}`);
    outputBox.textContent = 'QR Code recebido. Por favor, escaneie com seu celular.';
    qrcode.toDataURL(qr, { width: 250 }, (err, url) => {
        if (err) {
            outputBox.textContent = 'Erro ao gerar o QR Code.';
            return;
        }
        qrcodeContainer.innerHTML = `<img src="${url}" alt="QR Code">`;
        qrcodeContainer.style.display = 'block';
    });
});
ipcRenderer.on('bot-authenticated', (event, { botId }) => {
    const outputBox = document.getElementById(`output-box-${botId}`);
    const qrcodeContainer = document.getElementById(`qrcode-container-${botId}`);
    qrcodeContainer.innerHTML = '';
    qrcodeContainer.style.display = 'none';
    outputBox.textContent = 'Autenticado com sucesso! Carregando...';
});
ipcRenderer.on('bot-licence-expired', (event, { botId, message }) => {
    const outputBox = document.getElementById(`output-box-${botId}`);
    const qrcodeContainer = document.getElementById(`qrcode-container-${botId}`);
    
    qrcodeContainer.innerHTML = '';
    qrcodeContainer.style.display = 'none';

    outputBox.innerHTML = `<span style="color: #ff4d4d; font-weight: bold;">${message}</span>`;
    
    const startStopBtn = document.getElementById(`start-stop-btn-${botId}`);
    startStopBtn.dataset.status = 'parado';
    startStopBtn.textContent = '▶️ Iniciar Bot';
    startStopBtn.style.backgroundColor = 'var(--primary-blue)';
    setBotButtonsEnabled(botId, true);
    setGlobalButtonsEnabled(true);
});
ipcRenderer.on('bot-status', (event, { botId, status }) => {
    const startStopBtn = document.getElementById(`start-stop-btn-${botId}`);
    const outputBox = document.getElementById(`output-box-${botId}`);
    
    startStopBtn.dataset.status = status;
    switch (status) {
        case 'iniciado':
            startStopBtn.textContent = '⏹️ Parar Bot';
            startStopBtn.style.backgroundColor = 'var(--success-green)';
            setBotButtonsEnabled(botId, true);
            setGlobalButtonsEnabled(true);
            break;
        case 'parado':
            startStopBtn.textContent = '▶️ Iniciar Bot';
            startStopBtn.style.backgroundColor = 'var(--primary-blue)';
            if (!outputBox.textContent.includes('expirou')) {
                outputBox.textContent = 'O bot está inativo. Clique em \'Iniciar\' para começar.';
            }
            setBotButtonsEnabled(botId, true);
            setGlobalButtonsEnabled(true);
            break;
        case 'starting':
        case 'stopping':
        case 'restarting':
            const statusText = status.charAt(0).toUpperCase() + status.slice(1);
            startStopBtn.textContent = `${statusText}...`;
            startStopBtn.style.backgroundColor = '#6c757d';
            setBotButtonsEnabled(botId, false);
            setGlobalButtonsEnabled(false);
            break;
    }
});