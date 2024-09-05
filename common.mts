import * as ws from "ws";

export const SERVER_PORT = 6970;
export const SERVER_FPS = 30;
export const WORLD_WIDTH = 800;
export const WORLD_HEIGHT = 600;
export const PLAYER_SIZE = 30;
export const PLAYER_SPEED = 500;

export type Direction = 'left' | 'right' | 'up' | 'down';

export function isDirection(arg: any): arg is Direction {
  return DEFAULT_MOVING[arg as Direction] !== undefined;
}

export type Moving = {
  [k in Direction]: boolean
}

const directions: Direction[] = ['left', 'right', 'up', 'down'];

export const movingMask = (moving: Moving): number => {
  let mask = 0;
  for (let i = 0; i < directions.length; i++) {
    if (moving[directions[i]]) {
      mask = mask|(1<<i);
    }
  }

  return mask;
}

export const movingFromMask = (mask: number): Moving => {
  let moving: Moving = structuredClone(DEFAULT_MOVING);
  for (let i = 0; i < directions.length; i++) {
    if (((mask>>i)&1) !== 0) {
      moving[directions[i]] = true;
    }
  }

  return moving;
}

export const DEFAULT_MOVING: Moving = {
  left: false,
  right: false,
  up: false,
  down: false,
};

export type Vector2 = {
  x: number,
  y: number,
}

export const DIRECTION_VECTORS: { [key in Direction]: Vector2 } = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
};

export interface Player {
  id: number,
  x: number,
  y: number,
  moving: Moving,
  hue: number,
}

interface Field {
  offset: number,
  size: number,
  read(view: DataView, offset: number): number,
  write(view: DataView, offset: number, value: number): void,
}

const UINT8_SIZE = 1;
const UINT32_SIZE = 4;
const FLOAT32_SIZE = 4;

function allocUint8Field(allocator: { iota: number }): Field {
  const offset = allocator.iota;
  const size = UINT8_SIZE;
  allocator.iota += size;
  return {
    offset,
    size,
    read: (view, baseOffset) => view.getUint8(baseOffset + offset),
    write: (view, baseOffset, value) => view.setUint8(baseOffset + offset, value),
  };
}

function allocUint32Field(allocator: { iota: number }): Field {
  const offset = allocator.iota;
  const size = UINT32_SIZE;
  allocator.iota += size;
  return {
    offset,
    size,
    read: (view, baseOffset) => view.getUint32(baseOffset + offset, true),
    write: (view, baseOffset, value) => view.setUint32(baseOffset + offset, value, true),
  };
}

function allocFloat32Field(allocator: { iota: number }): Field {
  const offset = allocator.iota;
  const size = FLOAT32_SIZE;
  allocator.iota += size;
  return {
    offset,
    size,
    read: (view, baseOffset) => view.getFloat32(baseOffset + offset, true),
    write: (view, baseOffset, value) => view.setFloat32(baseOffset + offset, value, true),
  };
}

export const HelloStruct = (() => {
  const allocator = { iota: 0 };
  return {
    kind: allocUint8Field(allocator),
    id: allocUint32Field(allocator),
    x: allocFloat32Field(allocator),
    y: allocFloat32Field(allocator),
    hue: allocUint8Field(allocator),
    size: allocator.iota,
  };
})();

export interface Hello {
  kind: 'hello',
  id: number,
  x: number,
  y: number,
  hue: string,
}

export function isHello(arg: any): arg is Hello  {
  return arg
    && arg.kind === 'hello'
    && typeof(arg.id) === 'number'
    && typeof(arg.x) === 'number'
    && typeof(arg.y) === 'number'
    && typeof(arg.hue) === 'number'
}

export const PlayerJoinedStruct = (() => {
  const allocator = { iota: 0 };
  return {
    kind: allocUint8Field(allocator),
    id: allocUint32Field(allocator),
    x: allocFloat32Field(allocator),
    y: allocFloat32Field(allocator),
    hue: allocUint8Field(allocator),
    moving: allocUint8Field(allocator),
    size: allocator.iota,
  };
})();

export interface PlayerJoined {
  kind: 'PlayerJoined',
  id: number,
  x: number,
  y: number,
  hue: number,
}

export function isPlayerJoined(arg: any): arg is PlayerJoined  {
  return arg
    && arg.kind === 'PlayerJoined'
    && typeof(arg.id) === 'number'
    && typeof(arg.x) === 'number'
    && typeof(arg.y) === 'number'
    && typeof(arg.hue) === 'number'
}

export const PlayerLeftStruct = (() => {
  const allocator = { iota: 0 };
  return {
    kind: allocUint8Field(allocator),
    id: allocUint32Field(allocator),
    size: allocator.iota,
  };
})();

export interface PlayerLeft {
  kind: 'PlayerLeft',
  id: number,
}

export function isPlayerLeft(arg: any): arg is PlayerLeft  {
  return arg
    && arg.kind === 'PlayerLeft'
    && typeof(arg.id) === 'number'
}

export interface PlayerMoving {
  kind: 'playerMoving',
  start: boolean,
  direction: Direction,
}

export function isPlayerMoving(arg: any): arg is PlayerMoving  {
  return arg
    && arg.kind === 'playerMoving'
    && typeof(arg.start) === 'boolean'
    && isDirection(arg.direction)
}

export const PlayerMovedStruct = (() => {
  const allocator = { iota: 0 };
  return {
    kind: allocUint8Field(allocator),
    id: allocUint32Field(allocator),
    x: allocFloat32Field(allocator),
    y: allocFloat32Field(allocator),
    moving: allocUint8Field(allocator),
    size: allocator.iota,
  };
})();

export interface PlayerMoved {
  kind: 'PlayerMoved',
  id: number,
  x: number,
  y: number,
  start: boolean,
  direction: Direction,
}

export function isPlayerMoved(arg: any): arg is PlayerMoved  {
  return arg
    && arg.kind === 'PlayerMoved'
    && typeof(arg.x) === 'number'
    && typeof(arg.y) === 'number'
    && typeof(arg.start) === 'boolean'
    && isDirection(arg.direction)
}

export type Event = PlayerJoined | PlayerLeft | PlayerMoving | PlayerMoved;

interface Message {
  kind: string
}

export enum MessageKind {
  Hello,
  PlayerJoined,
  PlayerLeft,
  PlayerMoved,
}

interface MessageCounter {
  count: number,
  bytesCount: number,
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

export function updatePlayer (player: Player, deltaTime: number) {
  let dir: Direction;
  let dx = 0;
  let dy = 0;
  for (dir in DIRECTION_VECTORS) {
    if (player.moving[dir]) {
      dx += DIRECTION_VECTORS[dir].x;
      dy += DIRECTION_VECTORS[dir].y;
    }
  }
  const newX = player.x + dx * PLAYER_SPEED * deltaTime;
  const newY = player.y + dy * PLAYER_SPEED * deltaTime;
  player.x = fMod(newX, WORLD_WIDTH);
  player.y = fMod(newY, WORLD_HEIGHT);
}
