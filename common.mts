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
  style: string,
}

export interface Hello {
  kind: 'hello',
  id: number,
  x: number,
  y: number,
  style: string,
}

export function isHello(arg: any): arg is Hello  {
  return arg
    && arg.kind === 'hello'
    && typeof(arg.id) === 'number'
    && typeof(arg.x) === 'number'
    && typeof(arg.y) === 'number'
    && typeof(arg.style) === 'string'
}

export interface PlayerJoined {
  kind: 'playerJoined',
  id: number,
  x: number,
  y: number,
  style: string,
}

export function isPlayerJoined(arg: any): arg is PlayerJoined  {
  return arg
    && arg.kind === 'playerJoined'
    && typeof(arg.id) === 'number'
    && typeof(arg.x) === 'number'
    && typeof(arg.y) === 'number'
    && typeof(arg.style) === 'string'
}

export interface PlayerLeft {
  kind: 'playerLeft',
  id: number,
}

export function isPlayerLeft(arg: any): arg is PlayerLeft  {
  return arg
    && arg.kind === 'playerLeft'
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

export interface PlayerMoved {
  kind: 'playerMoved',
  id: number,
  x: number,
  y: number,
  start: boolean,
  direction: Direction,
}

export function isPlayerMoved(arg: any): arg is PlayerMoved  {
  return arg
    && arg.kind === 'playerMoved'
    && typeof(arg.x) === 'number'
    && typeof(arg.y) === 'number'
    && typeof(arg.start) === 'boolean'
    && isDirection(arg.direction)
}


export type Event = PlayerJoined | PlayerLeft | PlayerMoving | PlayerMoved;

interface Message {
  kind: string
}

export function sendMessage<T extends Message>(socket: ws.WebSocket | WebSocket, message: T) {
  socket.send(JSON.stringify(message));
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
