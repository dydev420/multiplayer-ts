import * as common from './common.mjs';
import type { Direction, Player, Hello, PlayerJoined, PlayerLeft, PlayerMoving } from "./common.mjs";

const DIRECTION_KEYS: {[key: string]: Direction} = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
  KeyA: 'left',
  KeyD: 'right',
  KeyW: 'up',
  KeyS: 'down',
};

(async () => {
  const gameCanvas = document.getElementById('game') as HTMLCanvasElement;
  gameCanvas.width = common.WORLD_WIDTH;
  gameCanvas.height = common.WORLD_HEIGHT;

  const ctx = gameCanvas.getContext('2d');
  if (!ctx) throw new Error('2d canvas not supported');

  
  /**
   * States
   */
  // replicated state
  let me : Player | undefined = undefined;
  const players = new Map<number, Player>();
  

  /**
   * WebSocket
   */
  const ws = new WebSocket(`ws://localhost:${common.SERVER_PORT}`);
  ws.addEventListener('open', (event) => {
    console.log('On WebSocket OPEN', event);
  });

  ws.addEventListener('close', (event) => {
    console.log('On WebSocket CLOSE', event);
  });

  ws.addEventListener('message', (event) => {
    if (me === undefined) {
      const messageData = JSON.parse(event.data.toString());
      if(common.isHello(messageData)) {
        me = {
          id: messageData.id,
          x: messageData.x,
          y: messageData.y,
          style: messageData.style,
          moving: structuredClone(common.DEFAULT_MOVING),
        };
        players.set(me.id, me);
        console.log('Connected Players id:', me, players);
      } else {
        console.log('Server is high. Closing connection');
        ws.close();
      }
    } else {
      console.log('Received messaged on player Id', me);
      const messageData = JSON.parse(event.data);
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
        console.log('Server unexpected. Closing connection');
        ws.close();
      }
    }
  });

  ws.addEventListener('error', (error) => {
    console.log('On WebSocket ERROR', error);
  });

  /**
   * Game Loop
   */
  let previousTimestamp = 0;
  const frame = (timestamp: number) => {
    const deltaTime = (timestamp - previousTimestamp)/1000;
    previousTimestamp = timestamp;    

    // loop logic
    ctx.fillStyle = '#181818';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    players.forEach((player) => {
      common.updatePlayer(player, deltaTime);
      
      // Draw Outline for current player
      if (me && player.id === me?.id) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(player.x - 5, player.y - 5, common.PLAYER_SIZE + 10, common.PLAYER_SIZE + 10);
      }

      // Draw Player Body
      ctx.fillStyle = player.style;
      ctx.fillRect(player.x, player.y, common.PLAYER_SIZE, common.PLAYER_SIZE);
    });


    window.requestAnimationFrame(frame);
  }
  window.requestAnimationFrame((timestamp) => {
    previousTimestamp = timestamp;
    window.requestAnimationFrame(frame);
  });

  /**
   * Input Handlers
   */
  window.addEventListener('keydown', (e) => {
    if(me === undefined) {
      return;
    }
    if (!e.repeat) {
      const direction = DIRECTION_KEYS[e.code];
      const currentPlayer = players.get(me.id);
      if (direction && currentPlayer) {
        common.sendMessage<PlayerMoving>(ws, {
          kind: 'playerMoving',
          start: true,
          direction,
        });
        // currentPlayer.moving[direction] = true;
      }
    }
  });
  window.addEventListener('keyup', (e) => {
    if(me === undefined) {
      return;
    }
    if (!e.repeat) {
      const direction = DIRECTION_KEYS[e.code];
      const currentPlayer = players.get(me.id);
      if (direction && currentPlayer) {
        common.sendMessage<PlayerMoving>(ws, {
          kind: 'playerMoving',
          start: false,
          direction,
        });
        // currentPlayer.moving[direction] = false;
      }
    }
  });
})();
