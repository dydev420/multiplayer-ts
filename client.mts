import { Vector2 } from './lib/vector.mjs';
import * as common from './common.mjs';
import type { Player, } from "./common.mjs";

const DIRECTION_KEYS: {[key: string]: common.Moving} = {
  ArrowLeft: common.Moving.TurningLeft,
  ArrowRight: common.Moving.TurningRight,
  ArrowUp: common.Moving.MovingForward,
  ArrowDown: common.Moving.MovingBackward,
  KeyA: common.Moving.TurningLeft,
  KeyD: common.Moving.TurningRight,
  KeyW: common.Moving.MovingForward,
  KeyS: common.Moving.MovingBackward,
};

function strokeLine(ctx: CanvasRenderingContext2D, p1: Vector2, p2: Vector2) {
   ctx.beginPath();
   ctx.moveTo(p1.x, p1.y);
   ctx.lineTo(p2.x, p2.y);
   ctx.stroke();
}

function drawPlayerBody(ctx: CanvasRenderingContext2D, player: Player) {
  // Draw Player Body
  ctx.fillStyle = `hsl(${player.hue} 80% 40%)`;
  ctx.fillRect(player.position.x, player.position.y, common.PLAYER_SIZE, common.PLAYER_SIZE);

  // forward direction arrow
  ctx.strokeStyle = `hsl(${player.hue} 80% 50%)`;
  ctx.lineWidth = 4;
  const center = player.position.clone().add(new Vector2(common.PLAYER_SIZE * 0.5, common.PLAYER_SIZE * 0.5));
  strokeLine(
    ctx,
    center,
    new Vector2().setPolar(player.direction, common.PLAYER_SIZE).add(center)
  );
}

function drawPlayerOutline(ctx: CanvasRenderingContext2D, player: Player) {
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(player.position.x - 5, player.position.y - 5, common.PLAYER_SIZE + 10, common.PLAYER_SIZE + 10);
}

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
        if (common.HelloStruct.verify(view)) {
          me = {
            id: common.HelloStruct.id.read(view),
            position: new Vector2(
              common.HelloStruct.x.read(view),
              common.HelloStruct.y.read(view),
            ),
            hue: common.HelloStruct.hue.read(view)/256*360,
            moving: 0,
            direction: common.HelloStruct.direction.read(view),
          };
          players.set(me.id, me);
          console.log('Connected Players', me);
        } else {
          console.log('Wrong Hello message received. Closing connection');
          ws.close();
        }
      } 
    } else {
      if(event.data instanceof ArrayBuffer) {
        const view = new DataView(event.data);
        if(common.BatchHeaderStruct.verifyJoined(view)) {
          const count = common.BatchHeaderStruct.count.read(view);

          for (let i = 0; i < count ; i++) {
            const offset = common.BatchHeaderStruct.size + i* common.PlayerStruct.size;
            const playerView = new DataView(event.data, offset, common.PlayerStruct.size);

            const playerId = common.PlayerStruct.id.read(playerView);
            const player = players.get(playerId);

            if(player) {
              player.position.x = common.PlayerStruct.x.read(playerView);
              player.position.y = common.PlayerStruct.y.read(playerView);
              player.hue = common.PlayerStruct.hue.read(playerView)/256*360;
              player.direction = common.PlayerStruct.direction.read(playerView);
              player.moving = common.PlayerStruct.moving.read(playerView);
            } else {
              const x = common.PlayerStruct.x.read(playerView);
              const y = common.PlayerStruct.y.read(playerView);
              players.set(playerId, {
                id: playerId,
                position: new Vector2(x, y),
                direction: common.PlayerStruct.direction.read(playerView), // change this or BUGS
                moving: common.PlayerStruct.moving.read(playerView),
                hue: common.PlayerStruct.hue.read(playerView)/256*360,
              });
            } 
          }
        } else if (common.PlayerLeftStruct.verify(view)) {
          players.delete(common.PlayerLeftStruct.id.read(view));
          console.log('Payer Left -- id:', common.PlayerLeftStruct.id.read(view));
        } else if (common.BatchHeaderStruct.verifyMoved(view)) {
          const count = common.BatchHeaderStruct.count.read(view);

          for (let i = 0; i < count ; i++) {
            const offset = common.BatchHeaderStruct.size + i* common.PlayerStruct.size;
            const playerView = new DataView(event.data, offset);

            const playerId = common.PlayerStruct.id.read(playerView);
            const player = players.get(playerId);
            if(!player) {
              console.log('Unknown player id:', playerId);
              return;
            }
            player.moving = common.PlayerStruct.moving.read(playerView);
            player.direction = common.PlayerStruct.direction.read(playerView);
            player.position.x = common.PlayerStruct.x.read(playerView);
            player.position.y = common.PlayerStruct.y.read(playerView);
          }
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
      // Player game loop
      players.forEach((player) => {
        // Update all player physics
        common.updatePlayer(player, deltaTime);
        
        if(player.id !== me?.id ) {
          drawPlayerBody(ctx, player);
        }
      });
      
      // Draw current player on top with outline
      if(me) {
        drawPlayerOutline(ctx, me);
        drawPlayerBody(ctx, me);
      }

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
