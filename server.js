const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
    const urlPath = req.url.split('?')[0];
    let filePath = path.join(__dirname, urlPath === '/' ? 'main.html' : urlPath);
    const extname = path.extname(filePath);
    let contentType = 'text/html';
    switch (extname) {
        case '.js': contentType = 'text/javascript'; break;
        case '.css': contentType = 'text/css'; break;
        case '.json': contentType = 'application/json'; break;
        case '.png': contentType = 'image/png'; break;
        case '.jpg': contentType = 'image/jpeg'; break;
        case '.svg': contentType = 'image/svg+xml'; break;
        case '.woff2': contentType = 'font/woff2'; break;
    }
    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                fs.readFile(path.join(__dirname, '404.html'), (err2, content2) => {
                    res.writeHead(404, { 'Content-Type': 'text/html' });
                    res.end(content2, 'utf-8');
                });
            } else {
                res.writeHead(500);
                res.end(`Server Error: ${err.code}`);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

const wss = new WebSocket.Server({ server });
const clients = new Map();
let nextPlayerId = 1;

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});

wss.on('connection', (ws) => {
    const playerId = nextPlayerId++;
    clients.set(ws, { id: playerId });
    console.log(`Player ${playerId} connected`);

    ws.send(JSON.stringify({ type: 'init', playerId }));

    const peerList = [];
    clients.forEach((client, clientWs) => {
        if (clientWs !== ws && clientWs.readyState === WebSocket.OPEN) {
            peerList.push(client.id);
        }
    });
    if (peerList.length > 0) {
        ws.send(JSON.stringify({ type: 'existingPeers', peers: peerList }));
    }

    clients.forEach((client, clientWs) => {
        if (clientWs !== ws && clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ type: 'peerJoined', playerId }));
        }
    });

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            data.playerId = clients.get(ws).id;

            if (['offer', 'answer', 'iceCandidate'].includes(data.type) && data.targetId) {
                let targetWs = null;
                clients.forEach((client, clientWs) => {
                    if (client.id === data.targetId) targetWs = clientWs;
                });
                if (targetWs && targetWs.readyState === WebSocket.OPEN) {
                    targetWs.send(JSON.stringify(data));
                }
            }
        } catch (e) {
            console.error('Error processing message:', e);
        }
    });

    ws.on('close', () => {
        const playerId = clients.get(ws).id;
        console.log(`Player ${playerId} disconnected`);
        clients.forEach((client, clientWs) => {
            if (clientWs !== ws && clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({ type: 'peerDisconnected', playerId }));
            }
        });
        clients.delete(ws);
    });
});
