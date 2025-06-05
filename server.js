const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Create HTTP server
const server = http.createServer((req, res) => {
    // Get the file path
    let filePath = path.join(__dirname, req.url === '/' ? 'main.html' : req.url);
    
    // Get the file extension
    const extname = path.extname(filePath);
    
    // Set content type based on file extension
    let contentType = 'text/html';
    switch (extname) {
        case '.js':
            contentType = 'text/javascript';
            break;
        case '.css':
            contentType = 'text/css';
            break;
        case '.json':
            contentType = 'application/json';
            break;
        case '.png':
            contentType = 'image/png';
            break;
        case '.jpg':
            contentType = 'image/jpg';
            break;
    }
    
    // Read the file
    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                // Page not found
                fs.readFile(path.join(__dirname, '404.html'), (err, content) => {
                    res.writeHead(404, { 'Content-Type': 'text/html' });
                    res.end(content, 'utf-8');
                });
            } else {
                // Server error
                res.writeHead(500);
                res.end(`Server Error: ${err.code}`);
            }
        } else {
            // Success
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

// Create a WebSocket server using the HTTP server
const wss = new WebSocket.Server({ server });

// Store connected clients
const clients = new Map();
let nextPlayerId = 1;

// Start the server
server.listen(3000, () => {
    console.log('Server running on port 3000');
});

wss.on('connection', (ws) => {
    // Assign a unique ID to this client
    const playerId = nextPlayerId++;
    clients.set(ws, { id: playerId });
    
    console.log(`Player ${playerId} connected`);
    
    // Send player ID to the client
    ws.send(JSON.stringify({ 
        type: 'init', 
        playerId: playerId 
    }));
    
    // Handle messages from clients
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            // Add player ID to the message
            data.playerId = clients.get(ws).id;
            
            // Broadcast to all other clients
            clients.forEach((client, clientWs) => {
                if (clientWs !== ws && clientWs.readyState === WebSocket.OPEN) {
                    clientWs.send(JSON.stringify(data));
                }
            });
        } catch (e) {
            console.error('Error processing message:', e);
        }
    });
    
    // Handle client disconnection
    ws.on('close', () => {
        const playerId = clients.get(ws).id;
        console.log(`Player ${playerId} disconnected`);
        
        // Notify other clients about disconnection
        clients.forEach((client, clientWs) => {
            if (clientWs !== ws && clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({ 
                    type: 'playerDisconnect', 
                    playerId: playerId 
                }));
            }
        });
        
        // Remove client from the map
        clients.delete(ws);
    });
});