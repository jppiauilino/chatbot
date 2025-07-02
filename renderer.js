const { ipcRenderer } = require('electron');
const qrcode = require('qrcode');

// Elementos da UI
const startStopBtn = document.getElementById('start-stop-btn');
const outputBox = document.getElementById('output-box');
const editBtn = document.getElementById('edit-btn');
const exitBtn = document.getElementById('exit-btn');
const mainView = document.getElementById('main-view');
const editorView = document.getElementById('editor-view');
const editorNav = document.getElementById('editor-nav');
const editorContent = document.getElementById('editor-content');
const saveBtn = document.getElementById('save-btn');
const cancelBtn = document.getElementById('cancel-btn');
const qrcodeContainer = document.getElementById('qrcode-container');
const toastContainer = document.getElementById('toast-container');

let originalMessages = {};

// --- Funções Auxiliares ---

function showMainView() {
    editorView.classList.add('hidden');
    mainView.classList.remove('hidden');
}

function showEditorView() {
    mainView.classList.add('hidden');
    editorView.classList.remove('hidden');
}

function setMainButtonsEnabled(enabled) {
    startStopBtn.disabled = !enabled;
    editBtn.disabled = !enabled;
    exitBtn.disabled = !enabled;
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

// --- Editor Visual (Versão Final) ---

/**
 * Converte uma chave de objeto para um título legível.
 */
function formatLabel(key) {
    return key
        .replace(/_/g, ' ')
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, str => str.toUpperCase())
        .trim();
}

/**
 * Cria os campos de formulário para uma categoria específica.
 * @param {HTMLElement} container - O elemento onde os campos serão inseridos.
 * @param {object} data - O objeto de dados da categoria.
 * @param {string} parentPath - O caminho para o objeto pai.
 */
function buildFormFields(container, data, parentPath) {
    // Se a categoria tem um array 'mensagens' (como 'resposta_outros' ou 'submenu_nossosPlanos')
    if (data.mensagens && Array.isArray(data.mensagens)) {
        data.mensagens.forEach((msg, index) => {
            if (msg.tipo === 'texto') {
                const currentPath = `${parentPath}.mensagens.${index}.conteudo`;
                const group = document.createElement('div');
                group.className = 'form-group';

                const label = document.createElement('label');
                // Se houver mais de uma mensagem, numera os blocos
                label.textContent = data.mensagens.length > 1 ? `Bloco de Texto ${index + 1}` : 'Conteúdo da Resposta';
                group.appendChild(label);

                const textarea = document.createElement('textarea');
                // O conteúdo pode ser um array de strings ou uma única string
                const contentValue = Array.isArray(msg.conteudo) ? msg.conteudo.join('\n') : msg.conteudo;
                const isArray = Array.isArray(msg.conteudo);

                textarea.value = contentValue;
                textarea.addEventListener('input', (e) => {
                    const newValue = isArray ? e.target.value.split('\n') : e.target.value;
                    setNestedValue(originalMessages, currentPath, newValue);
                });
                group.appendChild(textarea);
                container.appendChild(group);
            }
        });
        return;
    }

    // Lógica para outras categorias que não têm um array 'mensagens'
    for (const key in data) {
        const value = data[key];
        const currentPath = `${parentPath}.${key}`;

        if (key === 'titulo' && typeof value === 'string') {
            const group = document.createElement('div');
            group.className = 'form-group';
            
            const label = document.createElement('label');
            label.textContent = formatLabel(key);
            group.appendChild(label);
             
            const desc = document.createElement('p');
            desc.className = 'description';
            desc.textContent = 'Mensagem principal ou título do menu.';
            group.appendChild(desc);

            const textarea = document.createElement('textarea');
            textarea.value = value;
            textarea.addEventListener('input', (e) => {
                setNestedValue(originalMessages, currentPath, e.target.value);
            });
            group.appendChild(textarea);
            container.appendChild(group);
        }
    }
}


/**
 * Define um valor em um objeto aninhado usando um caminho de string (ex: 'a.b.c').
 */
function setNestedValue(obj, path, value) {
    const keys = path.split('.');
    let current = obj;
    for (let i = 0; i < keys.length - 1; i++) {
        if (current[keys[i]] === undefined) return; // Caminho não existe, interrompe
        current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = value;
}

/**
 * Exibe o formulário para a categoria selecionada.
 */
function displayCategoryForm(categoryKey) {
    editorContent.innerHTML = '';
    
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.key === categoryKey);
    });

    const categoryData = originalMessages[categoryKey];
    if (categoryData) {
        buildFormFields(editorContent, categoryData, categoryKey);
    }
}

/**
 * Popula o menu de navegação e exibe o primeiro formulário.
 */
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

// --- Event Listeners dos Botões ---

startStopBtn.addEventListener('click', () => {
    const isBotRunning = startStopBtn.dataset.status === 'iniciado';
    ipcRenderer.send(isBotRunning ? 'stop-bot' : 'start-bot');
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
        showToast('Mensagens salvas com sucesso! O bot será reiniciado.');
    } else {
        showToast(`ERRO AO SALVAR: ${result.message}`, 'error');
    }

    saveBtn.disabled = false;
    cancelBtn.disabled = false;
    saveBtn.textContent = 'Salvar e Reiniciar';
});

cancelBtn.addEventListener('click', () => {
    showMainView();
});

exitBtn.addEventListener('click', () => {
    ipcRenderer.send('exit-app');
});

// --- Handlers de Eventos IPC ---

ipcRenderer.on('clear-output', () => {
    outputBox.textContent = '';
    qrcodeContainer.innerHTML = '';
    qrcodeContainer.style.display = 'none';
});

ipcRenderer.on('bot-output', (event, data) => {
    if (outputBox.textContent.startsWith('O bot está inativo.')) outputBox.textContent = '';
    outputBox.textContent += data;
    outputBox.scrollTop = outputBox.scrollHeight;
});

ipcRenderer.on('qr-code', (event, qrText) => {
    outputBox.textContent = 'QR Code recebido. Por favor, escaneie com seu celular.';
    qrcode.toDataURL(qrText, { width: 250 }, (err, url) => {
        if (err) {
            outputBox.textContent = 'Erro ao gerar o QR Code.';
            return;
        }
        qrcodeContainer.innerHTML = `<img src="${url}" alt="QR Code">`;
        qrcodeContainer.style.display = 'block';
    });
});

ipcRenderer.on('bot-authenticated', () => {
    qrcodeContainer.innerHTML = '';
    qrcodeContainer.style.display = 'none';
    outputBox.textContent = 'Autenticado com sucesso! Carregando...';
});

ipcRenderer.on('bot-status', (event, status) => {
    startStopBtn.dataset.status = status;
    switch (status) {
        case 'iniciado':
            startStopBtn.textContent = '⏹️ Parar Bot';
            startStopBtn.style.backgroundColor = 'var(--success-green)';
            setMainButtonsEnabled(true);
            break;
        case 'parado':
            startStopBtn.textContent = '▶️ Iniciar Bot';
            startStopBtn.style.backgroundColor = 'var(--primary-blue)';
            if (!outputBox.textContent.includes('O bot foi parado')) {
                outputBox.textContent = 'O bot está inativo. Clique em \'Iniciar\' para começar.';
            }
            setMainButtonsEnabled(true);
            break;
        case 'starting':
        case 'stopping':
        case 'restarting':
            const statusText = status.charAt(0).toUpperCase() + status.slice(1);
            startStopBtn.textContent = `${statusText}...`;
            startStopBtn.style.backgroundColor = '#6c757d';
            setMainButtonsEnabled(false);
            break;
    }
});