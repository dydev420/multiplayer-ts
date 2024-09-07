import * as ws from "ws";
import { Vector2, Vector3 } from "./lib/vector.mjs";

export const SERVER_PORT = 6970;
export const SERVER_FPS = 60;
export const WORLD_WIDTH = 800;
export const WORLD_HEIGHT = 600;
export const PLAYER_SIZE = 30;
export const PLAYER_SPEED = 500;

export function properMod(a: number, b: number) {
  return (a % b + b) % b;
}

export enum Moving {
    MovingForward = 0,
    MovingBackward,
    TurningLeft,
    TurningRight,
    Count,
}

export function checkDirectionMask(moving: number, dir: number): number {
  return (moving>>dir)&1;
}

export function applyDirectionMask(moving: number, dir: number, start: number = 0): number {
  return start ? moving|(1<<dir) : moving&~(1<<dir);
}

export interface Player {
  id: number,
  position: Vector2,
  direction: number,
  moving: number,
  hue: number,
}

interface Field {
  offset: number,
  size: number,
  read(view: DataView): number,
  write(view: DataView, value: number): void,
}

const UINT8_SIZE = 1;
const UINT16_SIZE = 2;
const UINT32_SIZE = 4;
const FLOAT32_SIZE = 4;

function allocUint8Field(allocator: { iota: number }): Field {
  const offset = allocator.iota;
  const size = UINT8_SIZE;
  allocator.iota += size;
  return {
    offset,
    size,
    read: (view) => view.getUint8(offset),
    write: (view, value) => view.setUint8(offset, value),
  };
}

function allocUint16Field(allocator: { iota: number }): Field {
  const offset = allocator.iota;
  const size = UINT16_SIZE;
  allocator.iota += size;
  return {
    offset,
    size,
    read: (view) => view.getUint16(offset),
    write: (view, value) => view.setUint16(offset, value),
  };
}

function allocUint32Field(allocator: { iota: number }): Field {
  const offset = allocator.iota;
  const size = UINT32_SIZE;
  allocator.iota += size;
  return {
    offset,
    size,
    read: (view) => view.getUint32(offset, true),
    write: (view, value) => view.setUint32(offset, value, true),
  };
}

function allocFloat32Field(allocator: { iota: number }): Field {
  const offset = allocator.iota;
  const size = FLOAT32_SIZE;
  allocator.iota += size;
  return {
    offset,
    size,
    read: (view) => view.getFloat32(offset, true),
    write: (view, value) => view.setFloat32(offset, value, true),
  };
}

function verifier(kindField: Field, kind: number, size: number ): (view: DataView) => boolean {
  return (view) => view.byteLength === size && kindField.read(view) === kind;
} 

export enum MessageKind {
  Ping,
  Pong,
  Hello,
  PlayerJoined,
  PlayerLeft,
  PlayerMoved,
  PlayerMoving,
}

export const PingPongStruct = (() => {
  const allocator = { iota: 0 };
  const kind = allocUint8Field(allocator);
  const timestamp = allocUint32Field(allocator);
  const size = allocator.iota;
  const verifyPing = verifier(kind, MessageKind.Ping, size);
  const verifyPong = verifier(kind, MessageKind.Pong, size);
  return { kind, timestamp, size, verifyPing, verifyPong };
})();

export const HelloStruct = (() => {
  const allocator = { iota: 0 };
  const kind = allocUint8Field(allocator);
  const id = allocUint32Field(allocator);
  const x = allocFloat32Field(allocator);
  const y = allocFloat32Field(allocator);
  const direction = allocFloat32Field(allocator);
  const hue = allocUint8Field(allocator);
  const size = allocator.iota;
  const verify = verifier(kind, MessageKind.Hello, size);
  return { kind, id, x, y, direction, hue, size, verify };
})();

export const PlayerLeftStruct = (() => {
  const allocator = { iota: 0 };
  const kind = allocUint8Field(allocator);
  const id = allocUint32Field(allocator);
  const size = allocator.iota;
  const verify = verifier(kind, MessageKind.PlayerLeft, size);
  return { kind, id, size, verify };
})();

export const PlayerMovingStruct = (() => {
  const allocator = { iota: 0 };
  const kind = allocUint8Field(allocator);
  const direction = allocUint8Field(allocator);
  const start = allocUint8Field(allocator);
  const size = allocator.iota;
  const verify = verifier(kind, MessageKind.PlayerMoving, size);
  return { kind, direction, start, size, verify }
})()

export const PlayerStruct = (() => {
  const allocator = { iota: 0 };
  const id = allocUint32Field(allocator);
  const x = allocFloat32Field(allocator);
  const y = allocFloat32Field(allocator);
  const hue = allocUint8Field(allocator);
  const direction = allocFloat32Field(allocator);
  const moving = allocUint8Field(allocator);
  const size = allocator.iota;
  return { id, x, y, hue, direction, moving, size };
})();

export const BatchHeaderStruct = (() => {
  const allocator = { iota: 0 };
  const kind = allocUint8Field(allocator);
  const count = allocUint16Field(allocator);
  const size = allocator.iota;
  const verifyMoved = (view: DataView) => {
    return view.byteLength >= size
      && (view.byteLength - size) % PlayerStruct.size === 0
      && kind.read(view) === MessageKind.PlayerMoved
  };
  const verifyJoined = (view: DataView) => {
    return view.byteLength >= size
      && (view.byteLength - size) % PlayerStruct.size === 0
      && kind.read(view) === MessageKind.PlayerJoined
  };
  return {kind, count, size, verifyMoved, verifyJoined };
})();

interface MessageCounter {
  count: number,
  bytesCount: number,
}

interface Message {
  kind: string
}

export function sendMessage<T extends Message>(socket: ws.WebSocket | WebSocket, message: T, messageCounter?: MessageCounter) {
  const payload = JSON.stringify(message);
  socket.send(payload);
  if (messageCounter) {
    messageCounter.count += 1;
    messageCounter.bytesCount += payload.length;
  }
}

/**
 * Engine
 */
export function fMod(a: number, b: number) {
  return (a % b + b) % b;
}

export function updatePlayer(player: Player, deltaTime: number) {
  const controlVelocity = new Vector2(0);
  let angularVelocity = 0.0;
  if (checkDirectionMask(player.moving, Moving.MovingForward)) {
      controlVelocity.add(new Vector2().setPolar(player.direction, PLAYER_SPEED))
  }
  if (checkDirectionMask(player.moving, Moving.MovingBackward)) {
      controlVelocity.sub(new Vector2().setPolar(player.direction, PLAYER_SPEED))
  }
  if (checkDirectionMask(player.moving, Moving.TurningLeft)) {
      angularVelocity -= Math.PI;
  }
  if (checkDirectionMask(player.moving, Moving.TurningRight)) {
      angularVelocity += Math.PI;
  }
  player.direction = player.direction + angularVelocity*deltaTime;
  player.position.add(controlVelocity.scale(deltaTime));
  
  // Wrap Around (Not needed for FPS, only for 2D)
  player.position.x = properMod(player.position.x, WORLD_WIDTH);
  player.position.y = properMod(player.position.y, WORLD_HEIGHT);

  // const nx = player.position.x + player.controlVelocity.x*deltaTime;
  // if (sceneCanRectangleFitHere(scene, nx, player.position.y, MINIMAP_PLAYER_SIZE, MINIMAP_PLAYER_SIZE)) {
  //     player.position.x = nx;
  // }
  // const ny = player.position.y + player.controlVelocity.y*deltaTime;
  // if (sceneCanRectangleFitHere(scene, player.position.x, ny, MINIMAP_PLAYER_SIZE, MINIMAP_PLAYER_SIZE)) {
  //     player.position.y = ny;
  // }
}