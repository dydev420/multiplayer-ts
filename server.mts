import { WebSocketServer, WebSocket } from "ws";
import * as common from './common.mjs';
import type { Player, PlayerJoined, PlayerLeft, Event } from "./common.mjs";

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
    kind: 'playerJoined'
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

  for (let event of eventQueue) {
    switch(event.kind) {
      case 'playerJoined': {
        const joinedPlayer = players.get(event.id);
        if (!joinedPlayer) continue;

        joinedPlayer.ws.send(JSON.stringify({
          kind: 'hello',
          id: joinedPlayer.id
        }));

        players.forEach((otherPlayer) => {
          // Notify players about all previous joined active players
          joinedPlayer.ws.send(JSON.stringify({
            kind: 'playerJoined',
            id: otherPlayer.id,
            x: otherPlayer.x,
            y: otherPlayer.y,
            style: otherPlayer.style,
          }));

          const payload = JSON.stringify(event);
          // Notify all other players about new joined player
          if (otherPlayer.id !== joinedPlayer.id) {
            otherPlayer.ws.send(payload);
          }
        });

        break; 
      }
      case 'playerLeft': {
        const payload = JSON.stringify(event);
        players.forEach((player) => {
          player.ws.send(payload);
        });
        
        break;
      }
      case 'playerMoved': {
        const movedPlayer = players.get(event.id);
        if (!movedPlayer) continue;

        movedPlayer.moving[event.direction] = event.start;

        const payload = JSON.stringify(event);
        players.forEach((player) => {
          player.ws.send(payload);
        });

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
