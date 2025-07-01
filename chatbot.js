const fs = require('fs');
const path = require('path');
const { Client, LocalAuth } = require('whatsapp-web.js');

// --- CARREGAMENTO E VALIDAÇÃO DAS MENSAGENS ---
const messagesPath = path.join(__dirname, 'mensagens.json').replace('app.asar', 'app.asar.unpacked');
let mensagens;

try {
    const fileContent = fs.readFileSync(messagesPath, 'utf8');
    mensagens = JSON.parse(fileContent);
} catch (error) {
    console.error(`ERRO FATAL: ${error.message}`);
    process.exit(1);
}

// --- CONFIGURAÇÃO DO CLIENTE ---
const client = new Client({
    authStrategy: new LocalAuth({
        // Salva a sessão em um local persistente, fora da pasta da aplicação
        dataPath: path.join(require('os').homedir(), '.wwebjs_auth_painelex'),
    }),
    puppeteer: {
        headless: true, // Garante que o navegador rode em segundo plano
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process', // <- Importante para estabilidade em alguns ambientes
            '--disable-gpu'
        ],
    }
});

const userStates = {}; // Armazena o estado atual de cada usuário

const delay = ms => new Promise(res => setTimeout(res, ms));

// --- FUNÇÕES DO BOT ---

function buildMenu(menuData) {
    let menuText = menuData.titulo ? `${menuData.titulo}\n\n` : '';
    for (const key in menuData.menu) {
        menuText += `${key} - ${menuData.menu[key].texto}\n`;
    }
    return menuText.trim();
}

async function handleAction(chat, action, contact) {
    const actionData = mensagens[action];
    userStates[chat.id._serialized] = action; // Atualiza o estado do usuário

    if (!actionData) {
        console.error(`Ação '${action}' não encontrada em mensagens.json`);
        return;
    }

    if (actionData.mensagens) { // Sequência de mensagens (como nos planos)
        for (const message of actionData.mensagens) {
            if (message.delay) await delay(message.delay);
            await chat.sendStateTyping();
            if (message.tipo === 'texto') {
                let content = Array.isArray(message.conteudo) ? message.conteudo.join('\n') : message.conteudo;
                content = content.replace('{NOME_CLIENTE}', contact.pushname || 'amigo(a)');
                await client.sendMessage(chat.id._serialized, content);
            } else if (message.tipo === 'menu') {
                const menuText = buildMenu(message.conteudo);
                await client.sendMessage(chat.id._serialized, menuText);
            }
        }
    } else { // Menu único
        const name = contact.pushname || 'amigo(a)';
        const menuText = buildMenu(actionData).replace('{NOME_CLIENTE}', name.split(" ")[0]);
        await chat.sendStateTyping();
        await delay(1000);
        await client.sendMessage(chat.id._serialized, menuText);
    }
}

// --- EVENTOS DO CLIENTE ---

client.on('qr', qr => {
    if (process.send) {
        process.send({ type: 'qr', data: qr });
    } else {
        require('qrcode-terminal').generate(qr, { small: true });
    }
});

client.on('authenticated', () => {
    console.log('Autenticado com sucesso!');
    if(process.send) process.send({type: 'authenticated'});
});

client.on('ready', () => console.log('Tudo certo! WhatsApp conectado e pronto para uso.'));
client.on('disconnected', (reason) => console.log('Cliente foi desconectado!', reason));

client.initialize().catch(err => {
    console.error('Erro fatal ao inicializar o cliente:', err);
    process.exit(1);
});

client.on('message_create', async msg => {
    if (msg.fromMe) return; 
    if (!msg.from.endsWith('@c.us')) return;

    const chat = await msg.getChat();
    const contact = await msg.getContact();
    const userInput = msg.body.trim().toLowerCase();
    const currentState = userStates[msg.from] || 'boasVindas';

    let currentActionData = mensagens[currentState];
    let nextAction = null;

    if (currentActionData && currentActionData.menu && currentActionData.menu[userInput]) {
        nextAction = currentActionData.menu[userInput].acao;
    } else if (['menu', 'oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite'].some(k => userInput.includes(k))) {
        nextAction = 'boasVindas';
    }
    
    if (nextAction) {
        await handleAction(chat, nextAction, contact);
    
        const finalActionData = mensagens[nextAction];
        if (finalActionData && !finalActionData.menu) {
             userStates[msg.from] = 'boasVindas';
        }
    }
});

// Escuta mensagens do processo principal (main.js)
process.on('message', (message) => {
    if (message === 'shutdown') {
        console.log('Recebendo sinal de desligamento...');
        client.destroy().then(() => {
            process.exit(0);
        });
    }
});