import * as common from './common.mjs';
import type { Player, } from "./common.mjs";

const DIRECTION_KEYS: {[key: string]: common.Direction} = {
  ArrowLeft: common.Direction.Left,
  ArrowRight: common.Direction.Right,
  ArrowUp: common.Direction.Up,
  ArrowDown: common.Direction.Down,
  KeyA: common.Direction.Left,
  KeyD: common.Direction.Right,
  KeyW: common.Direction.Up,
  KeyS: common.Direction.Down,
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
  let ping = 0;

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
        if (common.HelloStruct.verifyAt(view)) {
          me = {
            id: common.HelloStruct.id.read(view),
            x: common.HelloStruct.x.read(view),
            y: common.HelloStruct.y.read(view),
            hue: common.HelloStruct.hue.read(view)/256*360,
            moving: 0,
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
        if(common.PlayerJoinedStruct.verifyAt(view)) {
          const id = common.PlayerJoinedStruct.id.read(view);
          players.set(id, {
            id,
            x: common.PlayerJoinedStruct.x.read(view),
            y: common.PlayerJoinedStruct.y.read(view),
            moving: common.PlayerJoinedStruct.moving.read(view),
            hue: common.PlayerJoinedStruct.hue.read(view)/256*360,
          });
        } else if (common.PlayerLeftStruct.verifyAt(view)) {
          players.delete(common.PlayerLeftStruct.id.read(view));
          console.log('Payer Left -- Players id:', players);
        } else if (common.PlayerMovedStruct.verifyAt(view)) {
          const playerId = common.PlayerMovedStruct.id.read(view);
          const player = players.get(playerId);
          if(!player) {
            console.log('Unknown player id:', playerId);
            return;
          }
          player.moving = common.PlayerMovedStruct.moving.read(view);
          player.x = common.PlayerMovedStruct.x.read(view);
          player.y = common.PlayerMovedStruct.y.read(view);
        } else if (common.PingPongStruct.verifyPong(view)) {
            ping = performance.now() - common.PingPongStruct.timestamp.read(view);
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
  const PING_COOL_DOWN = 60;
  let previousTimestamp = 0;
  let pingCoolDown = PING_COOL_DOWN;
  const frame = (timestamp: number) => {
    const deltaTime = (timestamp - previousTimestamp)/1000;
    previousTimestamp = timestamp;    

    // loop logic
    ctx.fillStyle = '#181818';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    if (ws === undefined) {
      const label = "Not Connected";
      const labelSize = ctx.measureText(label);
      ctx.font = "32px bold";
      ctx.fillStyle = "#080808";
      ctx.fillText(label, ctx.canvas.width/2 - labelSize.width/2, ctx.canvas.height/2 - labelSize.width/2);
    } else {
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

      // render ping stats
      ctx.font = "24px bold";
      ctx.fillStyle = "white";
      const pingPadding = ctx.canvas.width*0.05;
      ctx.fillText(`Ping: ${ping.toFixed(2)}ms`, pingPadding, pingPadding);
      
  
      // Send Ping to server
      pingCoolDown -= 1;
      if (pingCoolDown <= 0) {
        const view = new DataView(new ArrayBuffer(common.PingPongStruct.size));
        common.PingPongStruct.kind.write(view, common.MessageKind.Ping);
        common.PingPongStruct.timestamp.write(view, performance.now());
        ws.send(view);
  
        pingCoolDown = PING_COOL_DOWN;
      }
    }

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
    if(me === undefined || ws === undefined) {
      return;
    }
    if (!e.repeat) {
      const direction = DIRECTION_KEYS[e.code];
      if (direction !== undefined) {
        const view = new DataView(new ArrayBuffer(common.PlayerMovingStruct.size));
        common.PlayerMovingStruct.kind.write(view, common.MessageKind.PlayerMoving);
        common.PlayerMovingStruct.start.write(view, 1);
        common.PlayerMovingStruct.direction.write(view, direction);
        
        ws.send(view);
      }
    }
  });
  window.addEventListener('keyup', (e) => {
    if(me === undefined || ws === undefined) {
      return;
    }
    if (!e.repeat) {
      const direction = DIRECTION_KEYS[e.code];
      if (direction !== undefined) {
        const view = new DataView(new ArrayBuffer(common.PlayerMovingStruct.size));
        common.PlayerMovingStruct.kind.write(view, common.MessageKind.PlayerMoving);
        common.PlayerMovingStruct.start.write(view, 0);
        common.PlayerMovingStruct.direction.write(view, direction);
        ws.send(view);
      }
    }
  });
})();
