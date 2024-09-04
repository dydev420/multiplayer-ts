import { WebSocket } from "ws";
import * as common from './common.mjs';
import type { Player } from "./common.mjs";

const BOT_FPS = 30;

const ws = new WebSocket(`ws://localhost:${common.SERVER_PORT}`);
let me : Player | undefined = undefined;
const players = new Map<number, Player>();
let goalX = common.WORLD_WIDTH * 0.5;
let goalY = common.WORLD_HEIGHT * 0.5;

ws.addEventListener('message', (event) => {
  if (me === undefined) {
    const messageData = JSON.parse(event.data.toString());
    if(common.isHello(messageData)) {
      me = {
        ...messageData,
        moving: structuredClone(common.DEFAULT_MOVING),
      };
      players.set(me.id, me);
      console.log('Connected Players id:', me.id);
    } else {
      console.log('Server is high. Closing connection');
      ws.close();
    }
  } else {
    console.log('Received messaged on player Id', me.id);
    const messageData = JSON.parse(event.data.toString());
    if(common.isPlayerJoined(messageData)) {
      players.set(messageData.id, {
        id: messageData.id,
        x: messageData.x,
        y: messageData.y,
        moving: structuredClone(common.DEFAULT_MOVING),
        style: messageData.style,
      });
      console.log('New Player Joined -- Players id:', players);
    } else if (common.isPlayerLeft(messageData)) {
      players.delete(messageData.id);
      console.log('Payer Left -- Players id:', players);
    } else if (common.isPlayerMoved(messageData)) {
      console.log('Verified player move data', messageData);
      
      const player = players.get(messageData.id);
      if(!player) {
        console.log('Unknown player id:', messageData.id);
        return;
      }
      player.moving[messageData.direction] = messageData.start;
      player.x = messageData.x;
      player.y = messageData.y;
    } else {
      console.log('Server is high. Closing connection');
      ws.close();
    }
  }
});

// Bot loop
let previousTimestamp = 0;
const tick = () => {
  const timestamp = Date.now();
  const deltaTime = (timestamp - previousTimestamp)/1000;
  previousTimestamp = timestamp;

  // Continue looping
  setTimeout(tick, 1000 / BOT_FPS);
}

setTimeout(() => {
  previousTimestamp = Date.now();
  tick();
}, 1000 / BOT_FPS);

console.log("Hello from Bot");
