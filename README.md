# Multiplayer Platformer Game

A simple multiplayer platformer game with WebSocket-based networking.

## Setup Instructions

1. Install Node.js if you don't have it already (https://nodejs.org/)

2. Install dependencies:
   ```
   cd deflectgame
   npm install
   ```

3. Start the WebSocket server:
   ```
   npm start
   ```

4. Open the game in your browser:
   - Open `main.html` in your browser
   - For multiple players, open the same file in different browser windows

## Controls

- A/D: Move left/right
- Space: Jump
- J: Attack
- U: Attack left
- O: Attack right
- K: Deflect

## Multiplayer Features

- Real-time player synchronization
- Player-vs-player combat
- Dynamic player joining and leaving