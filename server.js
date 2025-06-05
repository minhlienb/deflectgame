const WebSocket = require('ws');

// Create a WebSocket server on port 8080
const wss = new WebSocket.Server({ port: 8080 });

// Store connected clients
const clients = new Map();
let nextPlayerId = 1;

console.log('WebSocket server started on port 8080');

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