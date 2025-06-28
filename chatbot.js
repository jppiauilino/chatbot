const fs = require('fs');
const qrcode = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');

const mensagens = JSON.parse(fs.readFileSync('mensagens.json', 'utf8'));

// Inicialização simplificada para usar as configurações padrão da versão estável
const client = new Client({
    authStrategy: new LocalAuth()
});

// Função para juntar as linhas das mensagens
function getMessage(messageKey) {
    const messageData = mensagens[messageKey];
    if (Array.isArray(messageData)) {
        return messageData.join('\n');
    }
    if (typeof messageData === 'object' && messageData !== null) {
        let fullMessage = [];
        for (const partKey in messageData) {
            const part = messageData[partKey];
            if(Array.isArray(part)) {
                fullMessage.push(part.join('\n'));
            } else {
                fullMessage.push(part);
            }
        }
        return fullMessage.join('\n\n');
    }
    return messageData;
}

client.on('qr', qr => {
    // CORREÇÃO AQUI
    console.log('QR Code recebido, escaneie com seu celular!');
    qrcode.generate(qr, {small: true});
});

client.on('authenticated', () => {
    console.log('Autenticado com sucesso!');
});

client.on('auth_failure', msg => {
    console.error('Falha na autenticação!', msg);
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
        const saudacao = getMessage('boasVindas').replace('{NOME_CLIENTE}', name.split(" ")[0]);
        await client.sendMessage(msg.from, saudacao);
    }

    if (body === '1' && msg.from.endsWith('@c.us')) {
        await chat.sendStateTyping();
        await delay(2000);
        await client.sendMessage(msg.from, getMessage('comoFunciona.parte1'));
        await delay(2000);
        await chat.sendStateTyping();
        await client.sendMessage(msg.from, getMessage('comoFunciona.parte2'));
        await delay(2000);
        await chat.sendStateTyping();
        await client.sendMessage(msg.from, getMessage('linkCadastro'));
    }

    if (body === '2' && msg.from.endsWith('@c.us')) {
        await chat.sendStateTyping();
        await delay(2000);
        await client.sendMessage(msg.from, getMessage('valoresPlanos'));
        await delay(2000);
        await chat.sendStateTyping();
        await client.sendMessage(msg.from, getMessage('linkCadastro'));
    }

    if (body === '3' && msg.from.endsWith('@c.us')) {
        await chat.sendStateTyping();
        await delay(2000);
        await client.sendMessage(msg.from, getMessage('beneficios'));
        await delay(2000);
        await chat.sendStateTyping();
        await client.sendMessage(msg.from, getMessage('linkCadastro'));
    }

    if (body === '4' && msg.from.endsWith('@c.us')) {
        await chat.sendStateTyping();
        await delay(2000);
        await client.sendMessage(msg.from, getMessage('comoAderir'));
        await delay(2000);
        await chat.sendStateTyping();
        await client.sendMessage(msg.from, getMessage('linkCadastro'));
    }

    if (body === '5' && msg.from.endsWith('@c.us')) {
        await chat.sendStateTyping();
        await delay(2000);
        await client.sendMessage(msg.from, getMessage('outrasPerguntas'));
    }
});
