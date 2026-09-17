export type Card = { id: string; rank: string; suit: string; pack: number };
export type Player = {
  id: string;
  name: string;
  skin: string;
  pose: string;
  score: number;
  count: number;
  eliminated: boolean;
  connected: boolean;
  seat?: number;
  back?: string;
  face?: string;
};
export type GameEvent = {
  seq: number;
  type: string;
  at: number;
  playerId?: string;
  source?: string;
  cards?: Card[];
  card?: Card;
  assaf?: boolean;
};
export type Result = {
  callerId: string;
  callerTotal: number;
  assaf: boolean;
  assafIds: string[];
  rows: {
    id: string;
    name: string;
    hand: Card[];
    comparison: number;
    points: number;
    subtotal: number;
    reduction: number;
    total: number;
    eliminated: boolean;
  }[];
};
export type State = {
  code: string;
  me: string;
  hostId: string;
  revision: number;
  phase: string;
  round: number;
  turnId: string;
  players: Player[];
  seatCount?: number;
  hand: Card[];
  previousDiscard: { cards: Card[]; kind: string };
  currentPlay: { cards: Card[]; kind: string };
  pickupIds: string[];
  deckCount: number;
  bonusId: string | null;
  deadline: number | null;
  result: Result | null;
  winnerId: string | null;
  chat: {
    id: string;
    playerId: string;
    name: string;
    text: string;
    at: number;
  }[];
  lastEvent: GameEvent | null;
};
export const rankValue = (c: Card) =>
  c.rank === "JOKER"
    ? 0
    : c.rank === "A"
      ? 1
      : ["V", "D", "R"].includes(c.rank)
        ? 10
        : Number(c.rank);
export const sum = (cards: Card[]) =>
  cards.reduce((n, c) => n + rankValue(c), 0);
