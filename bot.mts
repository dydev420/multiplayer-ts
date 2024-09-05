import { WebSocket } from "ws";
import * as common from './common.mjs';
import type { Player, Direction } from "./common.mjs";

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
  bot.ws.binaryType = 'arraybuffer';

  bot.ws.addEventListener('message', (event) => {
    if (event.data instanceof ArrayBuffer) {
      const view = new DataView(event.data);
      if (bot.me === undefined) {
        if(
          common.HelloStruct.size === view.byteLength
          && common.HelloStruct.kind.read(view, 0) === common.MessageKind.Hello
        ) {
          bot.me = {
            id: common.HelloStruct.id.read(view, 0),
            x: common.HelloStruct.x.read(view, 0),
            y: common.HelloStruct.y.read(view, 0),
            hue: common.HelloStruct.hue.read(view, 0)/256*360,
            moving: structuredClone(common.DEFAULT_MOVING),
          };
          // Start bot loop
          turn();
          console.log('Connected Bot id:', bot.me);
        } else {
            console.log('Wrong Hello message received. Closing connection', event);
            bot.ws.close();
          }
      } else {
        if (
          common.PlayerMovedStruct.size === view.byteLength
          && common.PlayerMovedStruct.kind.read(view, 0) === common.MessageKind.PlayerMoved
        ) {
          const botId = common.PlayerMovedStruct.id.read(view, 0);
          if(bot.me && botId === bot.me.id)  {
            bot.me.moving = common.movingFromMask(common.PlayerMovedStruct.moving.read(view, 0));
            bot.me.x = common.PlayerMovedStruct.x.read(view, 0);
            bot.me.y = common.PlayerMovedStruct.y.read(view, 0);
          }
        }
      }
    } else {
      console.log('Did not receive binary data on event');
      bot.ws.close();
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
          const view = new DataView(new ArrayBuffer(common.PlayerMovingStruct.size));
          common.PlayerMovingStruct.kind.write(view, 0, common.MessageKind.PlayerMoving);
          common.PlayerMovingStruct.moving.write(view, 0, common.movingMask(bot.me.moving));
          bot.ws.send(view);
        }
      }
  
      
      bot.timeoutBeforeTurn = undefined;
      do {
        const dx = bot.goalX - bot.me.x;
        const dy = bot.goalY - bot.me.y;
  
        if (Math.abs(dx) > EPS) {
          if(dx > 0) {
            bot.me.moving.right = true;
          } else {
            bot.me.moving.left = true;
          }
    
          bot.timeoutBeforeTurn = Math.abs(dx) / common.PLAYER_SPEED;
        } else if (Math.abs(dy) > EPS) {
          if(dy > 0) {
            bot.me.moving.down = true;
          } else {
            bot.me.moving.up = true;
          }
          
          bot.timeoutBeforeTurn = Math.abs(dy) / common.PLAYER_SPEED;
        }

        const view = new DataView(new ArrayBuffer(common.PlayerMovingStruct.size));
        common.PlayerMovingStruct.kind.write(view, 0, common.MessageKind.PlayerMoving);
        common.PlayerMovingStruct.moving.write(view, 0, common.movingMask(bot.me.moving));
        bot.ws.send(view);
  
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
