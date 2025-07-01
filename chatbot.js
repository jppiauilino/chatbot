const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');

// --- VERIFICAÇÃO DE ERROS DE SINTAXE ---
let mensagens;
const messagesPath = path.join(__dirname, 'mensagens.json').replace('app.asar', 'app.asar.unpacked');

try {
    // Tenta ler e interpretar o ficheiro JSON
    const fileContent = fs.readFileSync(messagesPath, 'utf8');
    mensagens = JSON.parse(fileContent);
} catch (error) {
    // Se houver um erro, envia uma mensagem clara para o painel
    console.error('--- ERRO DE SINTAXE NO FICHEIRO DE MENSAGENS ---');
    console.error('\nO ficheiro "mensagens.json" parece ter um erro de digitação (como uma vírgula a mais ou a falta de uma aspa).');
    console.error('\nPor favor, verifique o ficheiro com atenção.');
    console.error('\nDetalhes técnicos do erro:');
    console.error(error.message); // A mensagem exata do erro ajuda a encontrar o problema
    // Impede o bot de continuar, pois ele não teria o que responder
    process.exit(1); 
}
// --- FIM DA VERIFICAÇÃO ---

const isPackaged = __dirname.includes('app.asar');
const sessionPath = isPackaged 
  ? path.join(process.execPath, '..', 'wwebjs_auth')
  : 'wwebjs_auth';

const client = new Client({
    authStrategy: new LocalAuth({
      dataPath: sessionPath
    })
});

// Função segura para obter as mensagens
function getSafeMessage(path) {
    const keys = path.split('.');
    let current = mensagens;
    for (let i = 0; i < keys.length; i++) {
        if (!current || current[keys[i]] === undefined) {
            return `AVISO: A mensagem para '${path}' não foi encontrada no ficheiro de mensagens.`;
        }
        current = current[keys[i]];
    }

    if (Array.isArray(current)) {
        return current.join('\n');
    }
    return current;
}


client.on('qr', qr => {
    console.log('QR Code recebido, escaneie com seu celular!');
    qrcode.generate(qr, {small: true});
});

client.on('authenticated', () => {
    console.log('Autenticado com sucesso!');
});

client.on('ready', () => {
    console.log('Tudo certo! WhatsApp conectado e pronto para uso.');
});

client.initialize();

const delay = ms => new Promise(res => setTimeout(res, ms));

client.on('message', async msg => {
    const chat = await msg.getChat();
    const contact = await msg.getContact();
    const name = contact.pushname || 'amigo(a)';
    const body = msg.body.trim();

    if (body.match(/(menu|Menu|dia|tarde|noite|oi|Oi|Olá|olá|ola|Ola)/i) && msg.from.endsWith('@c.us')) {
        await chat.sendStateTyping();
        await delay(2000);
        const saudacao = getSafeMessage('boasVindas').replace('{NOME_CLIENTE}', name.split(" ")[0]);
        await client.sendMessage(msg.from, saudacao);
    }
    
    if (body === '1' && msg.from.endsWith('@c.us')) {
        await chat.sendStateTyping();
        await delay(2000);
        await client.sendMessage(msg.from, getSafeMessage('nossosPlanos.parte1'));
        await delay(2000);
        await chat.sendStateTyping();
        await client.sendMessage(msg.from, getSafeMessage('nossosPlanos.parte2'));
    }

    if (body === '2' && msg.from.endsWith('@c.us')) {
        await chat.sendStateTyping();
        await delay(2000);
        await client.sendMessage(msg.from, getSafeMessage('setorFinanceiro'));
    }

    if (body === '3' && msg.from.endsWith('@c.us')) {
        await chat.sendStateTyping();
        await delay(2000);
        await client.sendMessage(msg.from, getSafeMessage('ajuda'));
    }

    if (body === '4' && msg.from.endsWith('@c.us')) {
        await chat.sendStateTyping();
        await delay(2000);
        await client.sendMessage(msg.from, getSafeMessage('agendar'));
    }

    if (body === '5' && msg.from.endsWith('@c.us')) {
        await chat.sendStateTyping();
        await delay(2000);
        await client.sendMessage(msg.from, getSafeMessage('outros'));
    }
});