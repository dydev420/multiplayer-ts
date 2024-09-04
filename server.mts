import { WebSocketServer, WebSocket } from "ws";
import * as common from './common.mjs';
import type { Player, Hello, PlayerJoined, PlayerLeft, Event } from "./common.mjs";

interface PlayerWithSocket extends Player {
  ws: WebSocket
}

const players = new Map<number, PlayerWithSocket>()
let idCounter = 0;
const eventQueue: Array<Event> = [];

const wss = new WebSocketServer({
  port: common.SERVER_PORT,
});

const randomStyle = () => {
  return `hsl(${Math.random() * 360} 80% 50%)`;
}

wss.on('connection', (ws) => {
  const id = idCounter++;
  const x = Math.random() * common.WORLD_WIDTH;
  const y = Math.random() * common.WORLD_HEIGHT;
  const style = randomStyle();
  const player = {
    ws,
    id,
    x,
    y,
    style,
    moving: structuredClone(common.DEFAULT_MOVING),
  };

  console.log(`Client id:${id} Connected.`);

  players.set(id, player);
  eventQueue.push({
    id,
    style,
    x,
    y,
    kind: 'playerJoined',
  });

  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data.toString());
    if(common.isPlayerMoving(message)) {
      console.log('MOving PLayer try', message);
      eventQueue.push({
        kind: 'playerMoved',
        id,
        x: player.x,
        y: player.y,
        start: message.start,
        direction: message.direction,
      });
    } else {
      console.log('Client Sus');
      ws.close();
    }
  });

  ws.on('close', (event) => {
    players.delete(id);
    console.log(`Client id:${id} GONE.`);
    eventQueue.push({
      kind: 'playerLeft',
      id,
    });
  });
});

let previousTimestamp = 0;
const tick = () => {
  const timestamp = Date.now();
  const deltaTime = (timestamp - previousTimestamp)/1000;
  previousTimestamp = timestamp;

  const joinedIds = new Set<number>()
  const leftIds = new Set<number>()

  for (let event of eventQueue) {
    switch(event.kind) {
      case 'playerJoined': {
        joinedIds.add(event.id);
        break; 
      }
      case 'playerLeft': {
        if(!joinedIds.delete(event.id)) {
          leftIds.add(event.id);
        }
        break;
      }
    }
  }

  // Welcome all new joined players
  joinedIds.forEach((playerId) => {
    const joinedPlayer = players.get(playerId);
    if (joinedPlayer !== undefined) {
      common.sendMessage<Hello>(joinedPlayer.ws, {
        kind: 'hello',
        id: joinedPlayer.id,
        x: joinedPlayer.x,
        y: joinedPlayer.y,
        style: joinedPlayer.style,
      });

      players.forEach((otherPlayer) => {
        if (otherPlayer.id !== joinedPlayer.id) {
          // Notify new player about all other players
          common.sendMessage<PlayerJoined>(joinedPlayer.ws, {
            kind: 'playerJoined',
            id: otherPlayer.id,
            x: otherPlayer.x,
            y: otherPlayer.y,
            style: otherPlayer.style,
          });
        }
      });
    } 
  });

  // Notify all players others about who joined
  joinedIds.forEach((playerId) => {
    const joinedPlayer = players.get(playerId);
    if (joinedPlayer !== undefined) {
      players.forEach((otherPlayer) => {
        if(playerId !== otherPlayer.id) {
          common.sendMessage<PlayerJoined>(otherPlayer.ws, {
            kind: 'playerJoined',
            id: joinedPlayer.id,
            x: joinedPlayer.x,
            y: joinedPlayer.y,
            style: joinedPlayer.style,
          });
        }
      });
    }
  });

  // Notifying about who left
  leftIds.forEach((leftId) => {
    players.forEach((player) => {
      common.sendMessage<PlayerLeft>(player.ws, {
        kind: 'playerLeft',
        id: leftId,
      });
    });
  });

  // Notify about movement
  for (let event of eventQueue) {
    switch(event.kind) {
      case 'playerMoved': {
        const player = players.get(event.id);
        if (player !== undefined) { // This MAY happen if somebody joined, moved and left withing a single tick. Just skipping.
          player.moving[event.direction] = event.start;
          const eventString = JSON.stringify(event);
          players.forEach((player) => player.ws.send(eventString));
        }
        break;
      }
    }
  }

  eventQueue.length = 0;
  
  players.forEach((player) => common.updatePlayer(player, deltaTime));  

  setTimeout(tick, 1000/common.SERVER_FPS);
}

// Start Server Tick
setTimeout(() => {
  previousTimestamp = Date.now();
  tick();
}, 1000/common.SERVER_FPS);

console.log(`Listening on ws://localhost:${common.SERVER_PORT}`);
