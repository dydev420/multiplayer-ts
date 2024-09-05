import * as common from './common.mjs';
import type { Direction, Player, PlayerJoined, PlayerLeft, PlayerMoving } from "./common.mjs";

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
  ws.binaryType = 'arraybuffer';
 
  ws.addEventListener('open', (event) => {
    console.log('On WebSocket OPEN', event);
  });

  ws.addEventListener('close', (event) => {
    console.log('On WebSocket CLOSE', event);
  });

  ws.addEventListener('message', async (event) => {
    if (me === undefined) {
      if (event.data instanceof ArrayBuffer) {
        const view = new DataView(event.data);
        if (
          common.HelloStruct.size === view.byteLength
          && common.HelloStruct.kind.read(view, 0) === common.MessageKind.Hello
        ) {
          me = {
            id: common.HelloStruct.id.read(view, 0),
            x: common.HelloStruct.x.read(view, 0),
            y: common.HelloStruct.y.read(view, 0),
            hue: common.HelloStruct.hue.read(view, 0)/256*360,
            moving: structuredClone(common.DEFAULT_MOVING),
          };
          players.set(me.id, me);
          console.log('Connected Players id:', me, players);
        } else {
          console.log('Wrong Hello message received. Closing connection');
          ws.close();
        }
      } 
    } else {
      console.log('Received messaged on player', me);
      if(event.data instanceof ArrayBuffer) {
        const view = new DataView(event.data);
        if(
          common.PlayerJoinedStruct.size === view.byteLength
          && common.PlayerJoinedStruct.kind.read(view, 0) === common.MessageKind.PlayerJoined
        ) {
          const id = common.PlayerJoinedStruct.id.read(view, 0);
          players.set(id, {
            id,
            x: common.PlayerJoinedStruct.x.read(view, 0),
            y: common.PlayerJoinedStruct.y.read(view, 0),
            moving: common.movingFromMask(common.PlayerJoinedStruct.moving.read(view, 0)),
            hue: common.PlayerJoinedStruct.hue.read(view, 0)/256*360,
          });
        } else if (
          common.PlayerLeftStruct.size === view.byteLength
          && common.PlayerLeftStruct.kind.read(view, 0) === common.MessageKind.PlayerLeft
        ) {
          players.delete(common.PlayerLeftStruct.id.read(view, 0));
          console.log('Payer Left -- Players id:', players);
        } else if (
          common.PlayerMovedStruct.size === view.byteLength
          && common.PlayerMovedStruct.kind.read(view, 0) === common.MessageKind.PlayerMoved
        ) {
          
          const playerId = common.PlayerMovedStruct.id.read(view, 0);
          const player = players.get(playerId);
          if(!player) {
            console.log('Unknown player id:', playerId);
            return;
          }
          player.moving = common.movingFromMask(common.PlayerMovedStruct.moving.read(view, 0));
          player.x = common.PlayerMovedStruct.x.read(view, 0);
          player.y = common.PlayerMovedStruct.y.read(view, 0);
        } else {
          console.log('Unexpected binary message');
          ws.close();
        }
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
      ctx.fillStyle = `hsl(${player.hue} 80% 50%)`;
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
