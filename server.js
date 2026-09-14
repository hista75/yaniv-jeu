const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const BUILD = '4.0.0-terrasse-realiste';
const server = http.createServer(app);
const io = new Server(server);
app.use((req,res,next)=>{ res.set('Cache-Control','no-store, no-cache, must-revalidate, proxy-revalidate'); next(); });
app.use('/vendor', express.static(path.join(__dirname, 'node_modules', 'three', 'build')));
app.get('/version', (req,res)=>res.json({build:BUILD, generated:'2026-09-15'}));
app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};
const suits = ['♠', '♥', '♦', '♣'];
const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'V', 'D', 'R'];
const rv = { A:1, '2':2, '3':3, '4':4, '5':5, '6':6, '7':7, '8':8, '9':9, '10':10, V:11, D:12, R:13 };
const AVATARS = ['classique', 'jeune', 'costaud', 'nain', 'vieux', 'bg'];
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

function safeAvatar(v) { return AVATARS.includes(v) ? v : 'classique'; }
function safeName(v) { return String(v || 'Joueur').trim().slice(0, 18) || 'Joueur'; }
function playerPayload(input) {
  if (typeof input === 'string') return { name: safeName(input), avatar: 'classique' };
  return { name: safeName(input?.name), avatar: safeAvatar(input?.avatar) };
}

function deck() {
  const d = [];
  for (const s of suits) for (const r of ranks) d.push({ id: uid(), r, s });
  d.push({ id: uid(), r:'JOKER', s:'🃏' }, { id: uid(), r:'JOKER', s:'🃏' });
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

function val(c, jokerTen = false) {
  if (c.r === 'JOKER') return jokerTen ? 10 : 0;
  if (c.r === 'A') return 1;
  if (['V', 'D', 'R'].includes(c.r)) return 10;
  return +c.r;
}

function seqLayouts(cards) {
  if (cards.length < 3) return [];
  const non = cards.filter(c => c.r !== 'JOKER');
  const jokers = cards.filter(c => c.r === 'JOKER');
  if (!non.length) return [];
  const suit = non[0].s;
  if (non.some(c => c.s !== suit)) return [];
  const layouts = [];
  // Suite circulaire A..R, donc V-D-R-A est autorisé.
  for (let start = 1; start <= 13; start++) {
    const vals = Array.from({ length: cards.length }, (_, k) => ((start - 1 + k) % 13) + 1);
    const used = new Set();
    let ok = true;
    for (const c of non) {
      const v = rv[c.r];
      const pos = [];
      vals.forEach((x, i) => { if (x === v) pos.push(i); });
      const p = pos.find(i => !used.has(i));
      if (p === undefined) { ok = false; break; }
      used.add(p);
    }
    if (!ok || cards.length - used.size !== jokers.length) continue;
    const lay = Array(cards.length);
    for (const c of non) {
      const v = rv[c.r];
      const i = vals.findIndex((x, k) => x === v && !lay[k]);
      lay[i] = c;
    }
    let ji = 0;
    for (let i = 0; i < lay.length; i++) if (!lay[i]) lay[i] = jokers[ji++];
    layouts.push(lay);
  }
  return layouts;
}

function combo(cards) {
  if (cards.length === 1) return { ok:true, type:'single', pickup:[cards[0].id] };
  if (cards.length >= 2 && cards.every(c => c.r === cards[0].r)) {
    return { ok:true, type:'set', pickup:cards.map(c => c.id) };
  }
  const layouts = seqLayouts(cards);
  if (layouts.length) {
    const ends = new Set();
    layouts.forEach(l => { ends.add(l[0].id); ends.add(l[l.length - 1].id); });
    return { ok:true, type:'suite', pickup:[...ends] };
  }
  return { ok:false, pickup:[] };
}

function alive(room) { return room.players.filter(p => p.alive); }

function state(room, sid) {
  const p = room.players.find(x => x.id === sid);
  return {
    code: room.code,
    started: room.started,
    players: room.players.map((x, i) => ({
      id:x.id, name:x.name, avatar:x.avatar, score:x.score,
      cards:x.hand.length, alive:x.alive,
      turn:room.started && i === room.turn
    })),
    hand: p?.hand || [],
    discard: room.discard,
    legalPickup: room.legalPickup || [],
    deckCount: room.deck.length,
    turn: room.turn,
    phase: room.phase,
    message: room.message,
    host: room.players[0]?.id === sid,
    me: sid,
    taunt: room.taunt && room.taunt.winner === sid ? room.taunt : null
  };
}

function emit(room) {
  room.players.forEach(p => io.to(p.id).emit('state', state(room, p.id)));
}

function next(room) {
  const n = room.players.length;
  for (let k = 1; k <= n; k++) {
    const i = (room.turn + k) % n;
    if (room.players[i].alive) { room.turn = i; return; }
  }
}

function dealRound(room) {
  const d = deck();
  room.players.forEach(p => p.hand = p.alive ? d.splice(0, 5) : []); // TOUJOURS 5 CARTES AU DÉPART
  room.deck = d;
  room.discard = [room.deck.pop()];
  room.legalPickup = [room.discard[0].id];
  room.turn = room.players.findIndex(p => p.alive);
  room.phase = 'play';
}

function start(room) {
  room.players.forEach(p => { p.score = 0; p.alive = true; });
  room.started = true;
  dealRound(room);
  room.message = `5 cartes chacun — au tour de ${room.players[room.turn].name}`;
}

function endRound(room, caller) {
  const ci = room.players.indexOf(caller);
  room.taunt = null;
  const callerSum = caller.hand.reduce((a, c) => a + val(c, false), 0);
  const others = room.players.map((p, i) => p.alive && i !== ci ? p.hand.reduce((a, c) => a + val(c, false), 0) : Infinity);
  const assaf = Math.min(...others) <= callerSum;

  room.players.forEach((p, i) => {
    if (!p.alive) return;
    if (i === ci) p.score += assaf ? callerSum + 30 : 0;
    else p.score += p.hand.reduce((a, c) => a + val(c, true), 0); // Joker = 10 chez les autres à la fin
  });

  const newly = room.players.filter(p => p.alive && p.score >= 200);
  newly.forEach(p => p.alive = false);
  const survivors = alive(room);
  let base = assaf
    ? `${caller.name} se fait ASSAF : ${callerSum}+30 !`
    : `${caller.name} réussit YANIV : 0 point !`;
  if (newly.length) base += ` Éliminé(s) à 200 : ${newly.map(p => p.name).join(', ')}.`;

  if (!assaf) {
    const candidates = room.players.filter(p => p.alive && p.id !== caller.id);
    if (candidates.length) {
      const max = Math.max(...candidates.map(p => p.score));
      const targets = candidates.filter(p => p.score === max);
      const target = targets[Math.floor(Math.random() * targets.length)];
      room.taunt = { winner:caller.id, target:target.id, targetName:target.name, used:false };
    }
  }

  io.to(room.code).emit('roundResult', { caller:caller.id, assaf, callerSum, eliminated:newly.map(p => p.id) });

  if (survivors.length <= 1) {
    room.started = false;
    room.phase = 'over';
    room.message = survivors.length ? `${base} 🏆 ${survivors[0].name} gagne la finale !` : `${base} Plus aucun joueur.`;
    return;
  }

  dealRound(room);
  room.message = `${base} Nouvelle manche : 5 cartes chacun. Au tour de ${room.players[room.turn].name}.`;
}

io.on('connection', s => {
  s.on('create', input => {
    const info = playerPayload(input);
    let code;
    do code = Math.random().toString(36).slice(2, 6).toUpperCase(); while (rooms[code]);
    rooms[code] = {
      code,
      players:[{ id:s.id, name:info.name, avatar:info.avatar, score:0, hand:[], alive:true }],
      started:false, discard:[], legalPickup:[], deck:[], turn:0, phase:'lobby',
      message:'Partage le code avec tes potes'
    };
    s.join(code);
    emit(rooms[code]);
  });

  s.on('join', input => {
    const info = playerPayload(input);
    const r = rooms[String(input?.code || '').trim().toUpperCase()];
    if (!r || r.started) return s.emit('errorMsg', 'Salon introuvable ou déjà lancé');
    if (r.players.length >= 4) return s.emit('errorMsg', 'Salon complet (4 joueurs autour de la table)');
    r.players.push({ id:s.id, name:info.name, avatar:info.avatar, score:0, hand:[], alive:true });
    s.join(r.code);
    r.message = `${info.name} a rejoint le café`;
    emit(r);
  });

  s.on('start', code => {
    const r = rooms[code];
    if (r && r.players[0]?.id === s.id && r.players.length >= 2) {
      start(r);
      io.to(code).emit('gameAction', { type:'deal', text:'Nouvelle manche : 5 cartes chacun' });
      emit(r);
    }
  });

  s.on('play', ({ code, ids }) => {
    const r = rooms[code], p = r?.players[r.turn];
    if (!r || !r.started || p?.id !== s.id || r.phase !== 'play') return s.emit('errorMsg', "Ce n'est pas le moment de poser");
    if (!Array.isArray(ids) || !ids.length) return;
    const chosen = ids.map(id => p.hand.find(c => c.id === id)).filter(Boolean);
    if (chosen.length !== ids.length) return;
    const check = combo(chosen);
    if (!check.ok) return s.emit('errorMsg', 'Combinaison invalide : carte seule, même valeur, ou suite de même couleur avec Joker');

    p.hand = p.hand.filter(c => !ids.includes(c.id));
    r.discard = chosen; // ordre choisi = bait visuel
    r.legalPickup = check.pickup;
    r.phase = 'draw';
    r.message = `${p.name} a posé ${chosen.length} carte(s). Il doit maintenant piocher.`;
    io.to(code).emit('gameAction', {
      type:'play', playerId:p.id, cards:chosen,
      text:`${p.name} pose ${chosen.length} carte${chosen.length > 1 ? 's' : ''}`
    });
    emit(r);
  });

  s.on('draw', ({ code, cardId, fromDeck }) => {
    const r = rooms[code], p = r?.players[r.turn];
    if (!r || !r.started || p?.id !== s.id || r.phase !== 'draw') return s.emit('errorMsg', 'Tu dois poser avant de piocher');

    if (fromDeck) {
      if (!r.deck.length) {
        const keep = r.discard;
        r.deck = deck();
        r.discard = keep;
      }
      const c = r.deck.pop();
      p.hand.push(c);
      io.to(code).emit('gameAction', { type:'drawDeck', playerId:p.id, card:c, text:`${p.name} pioche une carte` });
    } else {
      if (!r.legalPickup.includes(cardId)) return s.emit('errorMsg', "Cette carte n'est pas une vraie extrémité de la combinaison");
      const c = r.discard.find(c => c.id === cardId);
      if (!c) return;
      p.hand.push(c);
      io.to(code).emit('gameAction', { type:'drawDiscard', playerId:p.id, card:c, text:`${p.name} récupère ${c.r === 'JOKER' ? 'le Joker' : c.r + c.s}` });
    }

    next(r);
    r.phase = 'play';
    r.message = `Au tour de ${r.players[r.turn].name}`;
    emit(r);
  });

  s.on('taunt', ({ code, text, emoji }) => {
    const r = rooms[code];
    if (!r || !r.taunt || r.taunt.winner !== s.id || r.taunt.used) return;
    const clean = String(text || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 100);
    if (!clean) return s.emit('errorMsg', 'Écris un petit message avant de chambrer');
    r.taunt.used = true;
    io.to(code).emit('tauntPlayed', {
      from:s.id, target:r.taunt.target, targetName:r.taunt.targetName,
      text:clean, emoji:String(emoji || '🫵😂').slice(0, 12)
    });
    r.taunt = null;
    emit(r);
  });

  s.on('yaniv', code => {
    const r = rooms[code], p = r?.players[r.turn];
    if (!r || !r.started || p?.id !== s.id || r.phase !== 'play') return;
    const sum = p.hand.reduce((a, c) => a + val(c, false), 0);
    if (sum > 7) return s.emit('errorMsg', `Ta main vaut ${sum} : il faut 7 ou moins`);
    endRound(r, p);
    emit(r);
  });

  s.on('disconnect', () => {
    for (const code of Object.keys(rooms)) {
      const r = rooms[code];
      const i = r.players.findIndex(p => p.id === s.id);
      if (i < 0) continue;
      r.players.splice(i, 1);
      if (!r.players.length) { delete rooms[code]; continue; }
      if (r.started && alive(r).length <= 1) {
        r.started = false;
        r.phase = 'over';
        r.message = alive(r)[0] ? `${alive(r)[0].name} gagne 🏆` : 'Partie terminée';
      } else {
        r.turn = Math.min(r.turn, r.players.length - 1);
        if (r.started && !r.players[r.turn]?.alive) r.turn = r.players.findIndex(p => p.alive);
        emit(r);
      }
    }
  });
});

server.listen(process.env.PORT || 3000, () => console.log(`Yaniv Café ${BUILD} sur http://localhost:${process.env.PORT || 3000}`));
