import { WebSocketServer, WebSocket } from "ws";
import * as common from './common.mjs';
import type { Player } from "./common.mjs";


const STATS_AVERAGE_CAPACITY = 30;

interface Stats {
  startedAt: number,
  upTime: number,
  tickCount: number,
  tickTimes: Array<number>,
  messagesSent: number,
  messagesReceived: number,
  tickMessagesSent: Array<number>,
  tickMessagesReceived: Array<number>,
  bytesSent: number,
  bytesReceived: number,
  tickBytesSent: Array<number>,
  tickBytesReceived: Array<number>,
  playersCount: number,
  playersJoined: number,
  playersLeft: number,
  rejectedMessages: number,
}

const stats: Stats = {
  // tick counter
  startedAt: performance.now(),
  upTime: 0,
  tickCount: 0,
  tickTimes: [],
  
  // messages
  messagesSent: 0,
  messagesReceived: 0,
  tickMessagesSent: [],
  tickMessagesReceived: [],
  
  // bytes
  bytesSent: 0,
  bytesReceived: 0,
  tickBytesSent: [],
  tickBytesReceived: [],

  // players
  playersCount: 0,
  playersJoined: 0,
  playersLeft: 0,

  // errors
  rejectedMessages: 0,
};

function average(xs: Array<number>) {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function pushAverage(xs: Array<number>, value: number) {
  if(xs.push(value) > STATS_AVERAGE_CAPACITY) {
    xs.shift();
  }
}

function printStats() {
  console.log('Stats -- ::');
  console.log('- Server Uptime s', (stats.upTime) / 1000);
  console.log('- Tick Count', stats.tickCount);
  console.log('- Avg tick time ms', average(stats.tickTimes));
  console.log('- Total messages sent', stats.messagesSent);
  console.log('- Total messages received', stats.messagesReceived);
  console.log('- Avg Tick messages sent', average(stats.tickMessagesSent));
  console.log('- Avg Tick messages received', average(stats.tickMessagesReceived));
  console.log('- Total bytes sent', stats.bytesSent);
  console.log('- Total bytes received', stats.bytesReceived);
  console.log('- Avg Tick bytes sent', average(stats.tickBytesSent));
  console.log('- Avg Tick bytes received', average(stats.tickBytesReceived));
  console.log('- Avg Tick bytes received', stats.tickBytesReceived.length);
  console.log('- Active players', stats.playersCount);
  console.log('- Total players joined', stats.playersJoined);
  console.log('- Total players left', stats.playersLeft);
  console.log('- Total Rejected Messages', stats.rejectedMessages);
}

interface PlayerOnServer extends Player {
  ws: WebSocket,
  moved: boolean,
}

const players = new Map<number, PlayerOnServer>()
let idCounter = 0;
let bytesReceivedWithinTick = 0;
let messagesReceivedWithinTick = 0;
const joinedIds = new Set<number>();
const leftIds = new Set<number>();

const wss = new WebSocketServer({
  port: common.SERVER_PORT,
});

const randomHue = () => {
  return Math.floor(Math.random() * 360);
}

wss.on('connection', (ws) => {
  ws.binaryType = 'arraybuffer';

  const id = idCounter++;
  const x = Math.random() * common.WORLD_WIDTH;
  const y = Math.random() * common.WORLD_HEIGHT;
  const hue = randomHue();
  const player = {
    ws,
    id,
    x,
    y,
    hue,
    moving: 0,
    moved: false,
  };

  console.log(`** Client id:${id} Connected.`);

  players.set(id, player);
  joinedIds.add(id);

  // update stats
  stats.playersJoined += 1;
  
  ws.addEventListener('message', (event) => {
    // update stats
    stats.messagesReceived += 1;
    stats.bytesReceived += event.data.toString().length;
    bytesReceivedWithinTick += event.data.toString().length;
    messagesReceivedWithinTick += 1;
    
    if (event.data instanceof ArrayBuffer) {
      const view = new DataView(event.data);
      
      if (common.PlayerMovingStruct.verifyAt(view, 0)) {
        player.moving = common.PlayerMovingStruct.moving.read(view, 0);
        player.moved = true;
      } else {
          stats.rejectedMessages += 1;
          console.log('Received unexpected message type');
          ws.close();
        }
    } else {
      console.log('Did not receive binary data');
      ws.close();
    }
  });

  ws.on('close', (event) => {
    console.log(`* Client id:${id} GONE.`);
    players.delete(id);
    if(!joinedIds.delete(id)) {
      leftIds.add(id);
    }
    
    // Update stats
    stats.playersLeft += 1;
  });
});

let previousTimestamp = 0;
const tick = () => {
  // States stuff
  const beginMs = performance.now();
  const messageCounter = {
    count: 0,
    bytesCount: 0,
  };

  const timestamp = Date.now();
  const deltaTime = (timestamp - previousTimestamp)/1000;
  previousTimestamp = timestamp;

  // Welcome all new joined players
  joinedIds.forEach((playerId) => {
    const joinedPlayer = players.get(playerId);
    if (joinedPlayer !== undefined) {
      const view = new DataView(new ArrayBuffer(common.HelloStruct.size));
      common.HelloStruct.kind.write(view, 0, common.MessageKind.Hello);
      common.HelloStruct.id.write(view, 0, joinedPlayer.id);
      common.HelloStruct.x.write(view, 0, joinedPlayer.x);
      common.HelloStruct.y.write(view, 0, joinedPlayer.y);
      common.HelloStruct.hue.write(view, 0, Math.floor(joinedPlayer.hue/360*256));
      joinedPlayer.ws.send(view);

      // Reconstruct all other players in new player's state
      players.forEach((otherPlayer) => {
        if (otherPlayer.id !== joinedPlayer.id) {
          const view = new DataView(new ArrayBuffer(common.PlayerJoinedStruct.size));
          common.PlayerJoinedStruct.kind.write(view, 0, common.MessageKind.PlayerJoined);
          common.PlayerJoinedStruct.id.write(view, 0, otherPlayer.id);
          common.PlayerJoinedStruct.x.write(view, 0, otherPlayer.x);
          common.PlayerJoinedStruct.y.write(view, 0, otherPlayer.y);
          common.PlayerJoinedStruct.hue.write(view, 0, Math.floor(otherPlayer.hue/360*256));
          common.PlayerJoinedStruct.moving.write(view, 0, otherPlayer.moving);
          joinedPlayer.ws.send(view);
        }
      });
    } 
  });

  // Notify all players others about who joined
  joinedIds.forEach((playerId) => {
    const joinedPlayer = players.get(playerId);
    if (joinedPlayer !== undefined) {
      const view = new DataView(new ArrayBuffer(common.PlayerJoinedStruct.size));
      common.PlayerJoinedStruct.kind.write(view, 0, common.MessageKind.PlayerJoined);
      common.PlayerJoinedStruct.id.write(view, 0, joinedPlayer.id);
      common.PlayerJoinedStruct.x.write(view, 0, joinedPlayer.x);
      common.PlayerJoinedStruct.y.write(view, 0, joinedPlayer.y);
      common.PlayerJoinedStruct.hue.write(view, 0, Math.floor(joinedPlayer.hue/360*256));
      common.PlayerJoinedStruct.moving.write(view, 0,joinedPlayer.moving);
      
      players.forEach((otherPlayer) => {
        if(playerId !== otherPlayer.id) {
          otherPlayer.ws.send(view);
        }
      });
    }
  });

  // Notifying about who left
  leftIds.forEach((leftId) => {
    const view = new DataView(new ArrayBuffer(common.PlayerLeftStruct.size));
    common.PlayerJoinedStruct.kind.write(view, 0, common.MessageKind.PlayerLeft);
    common.PlayerJoinedStruct.id.write(view, 0, leftId);
    players.forEach((player) => {
      player.ws.send(view);
    });
  });

  // Notify about movement
  players.forEach((player) => {
    if (player.moved) {
      const view = new DataView(new ArrayBuffer(common.PlayerMovedStruct.size));
      common.PlayerMovedStruct.kind.write(view, 0, common.MessageKind.PlayerMoved);
      common.PlayerMovedStruct.id.write(view, 0, player.id);
      common.PlayerMovedStruct.x.write(view, 0, player.x);
      common.PlayerMovedStruct.y.write(view, 0, player.y);
      common.PlayerMovedStruct.moving.write(view, 0, player.moving);
 
      
      players.forEach((otherPlayer) => {
        otherPlayer.ws.send(view);
      });

      player.moved = false;
    }
  });
  
  players.forEach((player) => common.updatePlayer(player, deltaTime));  
  
  /**
   * Update stats
  */
  const tickTime = performance.now() - beginMs;
  pushAverage(stats.tickTimes, tickTime)  
  
  stats.tickCount += 1;
  stats.messagesSent += messageCounter.count;
  pushAverage(stats.tickMessagesSent, messageCounter.count);
  pushAverage(stats.tickMessagesReceived, messagesReceivedWithinTick);
  stats.bytesSent += messageCounter.bytesCount;
  pushAverage(stats.tickBytesSent, messageCounter.bytesCount);
  pushAverage(stats.tickBytesReceived, bytesReceivedWithinTick);
  stats.playersCount = players.size;
  stats.upTime = performance.now() - stats.startedAt;
  if (stats.tickCount % common.SERVER_FPS === 0) {
   printStats();
  }
  
  // Reset event queue and loop again
  joinedIds.clear();
  leftIds.clear();
  bytesReceivedWithinTick = 0;
  messagesReceivedWithinTick = 0;
  setTimeout(tick, 1000/common.SERVER_FPS);
}

// Start Server Tick
setTimeout(() => {
  previousTimestamp = Date.now();
  tick();
}, 1000/common.SERVER_FPS);

console.log(`Listening on ws://localhost:${common.SERVER_PORT}`);
