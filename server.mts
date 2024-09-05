import { WebSocketServer, WebSocket } from "ws";
import * as common from './common.mjs';
import type { Player, PlayerJoined, PlayerLeft, Event } from "./common.mjs";


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

interface PlayerWithSocket extends Player {
  ws: WebSocket
}

const players = new Map<number, PlayerWithSocket>()
let idCounter = 0;
const eventQueue: Array<Event> = [];
let bytesReceivedWithinTick = 0;

const wss = new WebSocketServer({
  port: common.SERVER_PORT,
});

const randomHue = () => {
  return Math.floor(Math.random() * 360);
}

wss.on('connection', (ws) => {
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
    moving: structuredClone(common.DEFAULT_MOVING),
  };

  console.log(`** Client id:${id} Connected.`);

  players.set(id, player);
  eventQueue.push({
    id,
    hue,
    x,
    y,
    kind: 'PlayerJoined',
  });

  // update stats
  stats.playersJoined += 1;

  ws.addEventListener('message', (event) => {
    // update stats
    stats.messagesReceived += 1;
    stats.bytesReceived += event.data.toString().length;
    bytesReceivedWithinTick += event.data.toString().length;

    let message;
    try {
      message = JSON.parse(event.data.toString());
    } catch (e) {
      stats.rejectedMessages += 1;
      console.log('Received invalid JSON in message', event.data);
      ws.close();
      return;
    }

    // handle message
    if(common.isPlayerMoving(message)) {
      eventQueue.push({
        kind: 'playerMoved',
        id,
        x: player.x,
        y: player.y,
        start: message.start,
        direction: message.direction,
      });
    } else {
      stats.rejectedMessages += 1;
      console.log('Received unexpected message type', event.data);
      ws.close();
    }
  });

  ws.on('close', (event) => {
    players.delete(id);
    console.log(`* Client id:${id} GONE.`);
    eventQueue.push({
      kind: 'playerLeft',
      id,
    });
    
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

  const joinedIds = new Set<number>()
  const leftIds = new Set<number>()

  for (let event of eventQueue) {
    switch(event.kind) {
      case 'PlayerJoined': {
        joinedIds.add(event.id);
        break; 
      }
      case 'playerLeft': {
        if(!joinedIds.delete(event.id)) {
          leftIds.add(event.id);
        }
        break;
      }
    }
  }

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

      // common.sendMessage<Hello>(joinedPlayer.ws, {
      //   kind: 'Hello',
      //   id: joinedPlayer.id,
      //   x: joinedPlayer.x,
      //   y: joinedPlayer.y,
      //   hue: joinedPlayer.hue,
      // }, messageCounter);

      // Reconstruct all other players in new player's state
      players.forEach((otherPlayer) => {
        if (otherPlayer.id !== joinedPlayer.id) {
          const view = new DataView(new ArrayBuffer(common.PlayerJoinedStruct.size));
          common.PlayerJoinedStruct.kind.write(view, 0, common.MessageKind.PlayerJoined);
          common.PlayerJoinedStruct.id.write(view, 0, otherPlayer.id);
          common.PlayerJoinedStruct.x.write(view, 0, otherPlayer.x);
          common.PlayerJoinedStruct.y.write(view, 0, otherPlayer.y);
          common.PlayerJoinedStruct.hue.write(view, 0, Math.floor(otherPlayer.hue/360*256));
          common.PlayerJoinedStruct.moving.write(view, 0, common.movingMask(otherPlayer.moving));
          joinedPlayer.ws.send(view);

          // common.sendMessage<PlayerJoined>(joinedPlayer.ws, {
          //   kind: 'playerJoined',
          //   id: otherPlayer.id,
          //   x: otherPlayer.x,
          //   y: otherPlayer.y,
          //   hue: otherPlayer.hue,
          // }, messageCounter);
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
      common.PlayerJoinedStruct.moving.write(view, 0, common.movingMask(joinedPlayer.moving));

      
      players.forEach((otherPlayer) => {
        if(playerId !== otherPlayer.id) {
          otherPlayer.ws.send(view);
          // common.sendMessage<PlayerJoined>(otherPlayer.ws, {
          //   kind: 'PlayerJoined',
          //   id: joinedPlayer.id,
          //   x: joinedPlayer.x,
          //   y: joinedPlayer.y,
          //   hue: joinedPlayer.hue,
          // }, messageCounter);
        }
      });
    }
  });

  // Notifying about who left
  leftIds.forEach((leftId) => {
    players.forEach((player) => {
      common.sendMessage<PlayerLeft>(player.ws, {
        kind: 'playerLeft',
        id: leftId,
      }, messageCounter);
    });
  });

  // Notify about movement
  for (let event of eventQueue) {
    switch(event.kind) {
      case 'playerMoved': {
        const player = players.get(event.id);
        if (player !== undefined) { // This MAY happen if somebody joined, moved and left withing a single tick. Just skipping.
          player.moving[event.direction] = event.start;
          // const eventString = JSON.stringify(event);
          players.forEach((player) => common.sendMessage(player.ws, event, messageCounter));
        }
        break;
      }
    }
  }
  
  players.forEach((player) => common.updatePlayer(player, deltaTime));  
  
  /**
   * Update stats
  */
  const tickTime = performance.now() - beginMs;
  pushAverage(stats.tickTimes, tickTime)  
  
  stats.tickCount += 1;
  stats.messagesSent += messageCounter.count;
  pushAverage(stats.tickMessagesSent, messageCounter.count);
  pushAverage(stats.tickMessagesReceived, eventQueue.length);
  stats.bytesSent += messageCounter.bytesCount;
  pushAverage(stats.tickBytesSent, messageCounter.bytesCount);
  pushAverage(stats.tickBytesReceived, bytesReceivedWithinTick);
  stats.playersCount = players.size;
  stats.upTime = performance.now() - stats.startedAt;
  if (stats.tickCount % common.SERVER_FPS === 0) {
   printStats();
  }
  
  // Reset event queue and loop again
  eventQueue.length = 0;
  bytesReceivedWithinTick = 0;
  setTimeout(tick, 1000/common.SERVER_FPS);
}

// Start Server Tick
setTimeout(() => {
  previousTimestamp = Date.now();
  tick();
}, 1000/common.SERVER_FPS);

console.log(`Listening on ws://localhost:${common.SERVER_PORT}`);
