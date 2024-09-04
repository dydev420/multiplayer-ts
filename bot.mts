import { WebSocket } from "ws";
import * as common from './common.mjs';
import type { Player, Direction, PlayerMoving } from "./common.mjs";

// const EPS = 1e-6;
const EPS = 10;
const BOT_FPS = 30;

interface Bot {
  ws: WebSocket,
  me: Player | undefined,
  goalX: number,
  goalY: number,
  timeoutBeforeTurn: number | undefined,
  previousTimestamp: number | undefined,
}

function createBot(): Bot {
  const bot: Bot =  {
    ws : new WebSocket(`ws://localhost:${common.SERVER_PORT}`),
    me : undefined,
    goalX : common.WORLD_WIDTH * 0.5,
    goalY : common.WORLD_HEIGHT * 0.5,
    timeoutBeforeTurn: undefined,
    previousTimestamp: Date.now(),
  };

  bot.ws.addEventListener('message', (event) => {
    if (bot.me === undefined) {
      const messageData = JSON.parse(event.data.toString());
      if(common.isHello(messageData)) {
        bot.me = {
          id: messageData.id,
          x: messageData.x,
          y: messageData.y,
          style: messageData.style,
          moving: structuredClone(common.DEFAULT_MOVING),
        };
        // Start bot loop
        turn();
        console.log('Connected Bot id:', bot.me);
      } else {
        console.log('Server is high. Closing connection', messageData.kind, messageData.id);
        bot.ws.close();
      }
    } else {
      const messageData = JSON.parse(event.data.toString());
      console.log('Received messaged on player Id', bot.me.id);
      if (common.isPlayerMoved(messageData)) {
        console.log('Verified Bot move data', messageData);
        if(bot && (bot.me.id === messageData.id)) {
          bot.me.moving[messageData.direction] = messageData.start;
          bot.me.x = messageData.x;
          bot.me.y = messageData.y;
        }
      }
    }
  });

  // Bot loop
  const tick = () => {
    const timestamp = Date.now();
    const deltaTime = (timestamp - (bot.previousTimestamp ?? 0))/1000;
    bot.previousTimestamp = timestamp;
    
    if(bot.me !== undefined ) {
      common.updatePlayer(bot.me, deltaTime);
    }
    // Bot loop
    if (bot.timeoutBeforeTurn !== undefined) {
      bot.timeoutBeforeTurn -= deltaTime;
      if (bot.timeoutBeforeTurn <= 0) {
        turn();
      }
    }

    // Continue looping
    setTimeout(tick, 1000 / BOT_FPS);
  }

  setTimeout(() => {
    bot.previousTimestamp = Date.now();
    tick();
  }, 1000 / BOT_FPS);

  function turn() {
    if (bot.me !== undefined) {
      let direction: Direction;
      for (direction in bot.me.moving) { 
        if (bot.me.moving[direction]) {
          bot.me.moving[direction] = false;
          common.sendMessage<PlayerMoving>(bot.ws, {
            kind: 'playerMoving',
            start: false,
            direction,
          });
        }
      }
  
      
      bot.timeoutBeforeTurn = undefined;
      do {
        const dx = bot.goalX - bot.me.x;
        const dy = bot.goalY - bot.me.y;
  
        if (Math.abs(dx) > EPS) {
          if(dx > 0) {
            common.sendMessage<PlayerMoving>(bot.ws, {
              kind: 'playerMoving',
              start: true,
              direction: 'right',
            });
          } else {
            common.sendMessage<PlayerMoving>(bot.ws, {
              kind: 'playerMoving',
              start: true,
              direction: 'left',
            });
          }
    
          bot.timeoutBeforeTurn = Math.abs(dx) / common.PLAYER_SPEED;
        } else if (Math.abs(dy) > EPS) {
          if(dy > 0) {
            common.sendMessage<PlayerMoving>(bot.ws, {
              kind: 'playerMoving',
              start: true,
              direction: 'down',
            });
          } else {
            common.sendMessage<PlayerMoving>(bot.ws, {
              kind: 'playerMoving',
              start: true,
              direction: 'up',
            });
          }
          
          bot.timeoutBeforeTurn = Math.abs(dy) / common.PLAYER_SPEED;
        }
  
        // new random target if reached goal
        if (bot.timeoutBeforeTurn === undefined) {
          bot.goalX = Math.random() * common.WORLD_WIDTH;
          bot.goalY = Math.random() * common.WORLD_HEIGHT;
        }
      } while (bot.timeoutBeforeTurn === undefined);
    }
  }

  return bot;
}


let bots: Array<Bot> = [];
for (let i = 0; i < 20; i++) {
  bots.push(createBot());
}


console.log("Hello from Bot");
