import { WebSocket } from "ws";
import * as common from './common.mjs';
import type { Player } from "./common.mjs";

// Set number of bots
const TOTAL_BOTS = 20;

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
    if (!(event.data instanceof ArrayBuffer)) {
      return;
    }

    const view = new DataView(event.data);
    if (bot.me === undefined) {
      if (common.HelloStruct.verify(view)) {
        bot.me = {
          id: common.HelloStruct.id.read(view),
          x: common.HelloStruct.x.read(view),
          y: common.HelloStruct.y.read(view),
          hue: common.HelloStruct.hue.read(view)/256*360,
          moving: 0,
        };
        // Start bot loop
        turn();
        console.log('Connected Bot id:', bot.me);
      } else {
          console.log('Wrong Hello message received. Closing connection', event);
          bot.ws.close();
        }
    } else {
      if (common.BatchHeaderStruct.verifyMoved(view)) {
        const count = common.BatchHeaderStruct.count.read(view);
        
        for (let i = 0; i < count ; i++) {
          const offset = common.BatchHeaderStruct.size + i* common.PlayerStruct.size;
          const playerView = new DataView(event.data, offset);

          const playerId = common.PlayerStruct.id.read(playerView);
          if(bot.me && playerId === bot.me.id)  {
            bot.me.moving = common.PlayerStruct.moving.read(playerView);
            bot.me.x = common.PlayerStruct.x.read(playerView);
            bot.me.y = common.PlayerStruct.y.read(playerView);
          }
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
      const view = new DataView(new ArrayBuffer(common.PlayerMovingStruct.size));
      common.PlayerMovingStruct.kind.write(view, common.MessageKind.PlayerMoving);

      // Full stop
      for (let direction = 0; direction < common.Direction.Count; ++direction) {
        if ((bot.me.moving >> direction) & 1) {
          common.PlayerMovingStruct.direction.write(view, direction);
          common.PlayerMovingStruct.start.write(view, 0);
          bot.ws.send(view);
        }
      }

      // New direction
      const direction = Math.floor(Math.random() * common.Direction.Count);
      bot.timeoutBeforeTurn = Math.random() * common.WORLD_WIDTH * 0.5 / common.PLAYER_SPEED;

      // Sync
      common.PlayerMovingStruct.direction.write(view, direction);
      common.PlayerMovingStruct.start.write(view, 1);
      bot.ws.send(view);
    }
  }

  return bot;
}


let bots: Array<Bot> = [];
for (let i = 0; i < TOTAL_BOTS; i++) {
  bots.push(createBot());
}


console.log("Hello from Bot");
