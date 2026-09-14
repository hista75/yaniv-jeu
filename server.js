const express=require('express');
const http=require('http');
const {Server}=require('socket.io');
const path=require('path');
const app=express(), server=http.createServer(app), io=new Server(server);
app.use(express.static(path.join(__dirname,'public')));
const rooms={};
const suits=['♠','♥','♦','♣'], ranks=['A','2','3','4','5','6','7','8','9','10','V','D','R'];
const rv={A:1,'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,V:11,D:12,R:13};
const uid=()=>Math.random().toString(36).slice(2)+Date.now().toString(36);
function deck(){let d=[];for(const s of suits)for(const r of ranks)d.push({id:uid(),r,s});d.push({id:uid(),r:'JOKER',s:'🃏'},{id:uid(),r:'JOKER',s:'🃏'});for(let i=d.length-1;i;i--){let j=Math.floor(Math.random()*(i+1));[d[i],d[j]]=[d[j],d[i]]}return d}
function val(c,jokerTen=false){if(c.r==='JOKER')return jokerTen?10:0;if(c.r==='A')return 1;if(['V','D','R'].includes(c.r))return 10;return +c.r}
function seqLayouts(cards){if(cards.length<3)return[];let non=cards.filter(c=>c.r!=='JOKER'), jokers=cards.filter(c=>c.r==='JOKER');if(!non.length)return[];let suit=non[0].s;if(non.some(c=>c.s!==suit))return[];let layouts=[];
 // Circular rank order permits ...V,D,R,A...; try every consecutive window of this length on A..R cycle.
 for(let start=1;start<=13;start++){let vals=Array.from({length:cards.length},(_,k)=>((start-1+k)%13)+1);let used=new Set();let ok=true;for(const c of non){let v=rv[c.r], pos=[];vals.forEach((x,i)=>{if(x===v)pos.push(i)});let p=pos.find(i=>!used.has(i));if(p===undefined){ok=false;break}used.add(p)}if(!ok||cards.length-used.size!==jokers.length)continue;let lay=Array(cards.length);for(const c of non){let v=rv[c.r];let i=vals.findIndex((x,k)=>x===v&&!lay[k]);lay[i]=c}let ji=0;for(let i=0;i<lay.length;i++)if(!lay[i])lay[i]=jokers[ji++];layouts.push(lay)}return layouts}
function combo(cards){if(cards.length===1)return {ok:true,type:'single',pickup:[cards[0].id]};if(cards.length>=2&&cards.every(c=>c.r===cards[0].r))return {ok:true,type:'set',pickup:cards.map(c=>c.id)};let layouts=seqLayouts(cards);if(layouts.length){let ends=new Set();layouts.forEach(l=>{ends.add(l[0].id);ends.add(l[l.length-1].id)});return {ok:true,type:'suite',pickup:[...ends]}}return {ok:false,pickup:[]}}
function alive(room){return room.players.filter(p=>p.alive)}
function state(room,sid){let p=room.players.find(x=>x.id===sid);return {code:room.code,started:room.started,players:room.players.map((x,i)=>({id:x.id,name:x.name,score:x.score,cards:x.hand.length,alive:x.alive,turn:room.started&&i===room.turn})),hand:p?.hand||[],discard:room.discard,legalPickup:room.legalPickup||[],turn:room.turn,phase:room.phase,message:room.message,host:room.players[0]?.id===sid,me:sid,taunt:room.taunt&&room.taunt.winner===sid?room.taunt:null};}
function emit(room){room.players.forEach(p=>io.to(p.id).emit('state',state(room,p.id)))}
function next(room){let n=room.players.length;for(let k=1;k<=n;k++){let i=(room.turn+k)%n;if(room.players[i].alive){room.turn=i;return}}}
function dealRound(room){let d=deck();room.players.forEach(p=>p.hand=p.alive?d.splice(0,5):[]);room.deck=d;room.discard=[room.deck.pop()];room.legalPickup=[room.discard[0].id];room.turn=room.players.findIndex(p=>p.alive);room.phase='play';}
function start(room){room.players.forEach(p=>{p.score=0;p.alive=true});room.started=true;dealRound(room);room.message=`5 cartes chacun — au tour de ${room.players[room.turn].name}`;}
function endRound(room,caller){let ci=room.players.indexOf(caller);room.taunt=null;let callerSum=caller.hand.reduce((a,c)=>a+val(c,false),0);let others=room.players.map((p,i)=>p.alive&&i!==ci?p.hand.reduce((a,c)=>a+val(c,false),0):Infinity);let assaf=Math.min(...others)<=callerSum;
 room.players.forEach((p,i)=>{if(!p.alive)return;if(i===ci)p.score+=assaf?callerSum+30:0;else p.score+=p.hand.reduce((a,c)=>a+val(c,true),0)});
 let newly=room.players.filter(p=>p.alive&&p.score>=200);newly.forEach(p=>p.alive=false);
 let survivors=alive(room);let base=assaf?`${caller.name} se fait ASSAF : ${callerSum}+30 !`:`${caller.name} réussit YANIV : 0 point !`;if(newly.length)base+=` Éliminé(s) à 200 : ${newly.map(p=>p.name).join(', ')}.`;
 if(!assaf){let candidates=room.players.filter(p=>p.alive&&p.id!==caller.id);if(candidates.length){let max=Math.max(...candidates.map(p=>p.score));let targets=candidates.filter(p=>p.score===max);let target=targets[Math.floor(Math.random()*targets.length)];room.taunt={winner:caller.id,target:target.id,targetName:target.name,used:false};}}
 if(survivors.length<=1){room.started=false;room.phase='over';room.message=survivors.length?`${base} 🏆 ${survivors[0].name} gagne la finale !`:`${base} Plus aucun joueur.`;return}
 dealRound(room);room.message=`${base} Nouvelle manche : 5 cartes chacun. Au tour de ${room.players[room.turn].name}.`;
}
io.on('connection',s=>{
 s.on('create',name=>{let code;do code=Math.random().toString(36).slice(2,6).toUpperCase();while(rooms[code]);rooms[code]={code,players:[{id:s.id,name:(name||'Joueur').slice(0,18),score:0,hand:[],alive:true}],started:false,discard:[],legalPickup:[],deck:[],turn:0,phase:'lobby',message:'Partage le code avec tes potes'};s.join(code);emit(rooms[code])});
 s.on('join',({code,name})=>{let r=rooms[(code||'').trim().toUpperCase()];if(!r||r.started)return s.emit('errorMsg','Salon introuvable ou déjà lancé');if(r.players.length>=8)return s.emit('errorMsg','Salon complet (8 joueurs)');r.players.push({id:s.id,name:(name||'Joueur').slice(0,18),score:0,hand:[],alive:true});s.join(r.code);r.message=`${name||'Un joueur'} a rejoint le café`;emit(r)});
 s.on('start',code=>{let r=rooms[code];if(r&&r.players[0]?.id===s.id&&r.players.length>=2){start(r);emit(r)}});
 s.on('play',({code,ids})=>{let r=rooms[code],p=r?.players[r.turn];if(!r||!r.started||p?.id!==s.id||r.phase!=='play')return s.emit('errorMsg',"Ce n'est pas le moment de poser");if(!Array.isArray(ids)||!ids.length)return;let chosen=ids.map(id=>p.hand.find(c=>c.id===id)).filter(Boolean);if(chosen.length!==ids.length)return;let check=combo(chosen);if(!check.ok)return s.emit('errorMsg','Combinaison invalide : carte seule, même valeur, ou suite de même couleur avec Joker');p.hand=p.hand.filter(c=>!ids.includes(c.id));r.discard=chosen; // preserve the player's chosen/display order = bait
 r.legalPickup=check.pickup;r.phase='draw';r.message=`${p.name} a posé ${chosen.length} carte(s). Il doit maintenant piocher.`;emit(r)});
 s.on('draw',({code,cardId,fromDeck})=>{let r=rooms[code],p=r?.players[r.turn];if(!r||!r.started||p?.id!==s.id||r.phase!=='draw')return s.emit('errorMsg','Tu dois poser avant de piocher');if(fromDeck){if(!r.deck.length){let keep=r.discard; r.deck=deck(); r.discard=keep}p.hand.push(r.deck.pop())}else{if(!r.legalPickup.includes(cardId))return s.emit('errorMsg',"Cette carte n'est pas une vraie extrémité de la combinaison");let c=r.discard.find(c=>c.id===cardId);if(!c)return;p.hand.push(c)}next(r);r.phase='play';r.message=`Au tour de ${r.players[r.turn].name}`;emit(r)});
 s.on('taunt',({code,text,emoji})=>{let r=rooms[code];if(!r||!r.taunt||r.taunt.winner!==s.id||r.taunt.used)return;let clean=String(text||'').replace(/[\r\n]+/g,' ').trim().slice(0,100);if(!clean)return s.emit('errorMsg','Écris un petit message avant de chambrer');r.taunt.used=true;io.to(code).emit('tauntPlayed',{from:s.id,target:r.taunt.target,targetName:r.taunt.targetName,text:clean,emoji:String(emoji||'🫵😂').slice(0,12)});r.taunt=null;emit(r)});
 s.on('yaniv',code=>{let r=rooms[code],p=r?.players[r.turn];if(!r||!r.started||p?.id!==s.id||r.phase!=='play')return;let sum=p.hand.reduce((a,c)=>a+val(c,false),0);if(sum>7)return s.emit('errorMsg',`Ta main vaut ${sum} : il faut 7 ou moins`);endRound(r,p);emit(r)});
 s.on('disconnect',()=>{for(const code of Object.keys(rooms)){let r=rooms[code],i=r.players.findIndex(p=>p.id===s.id);if(i<0)continue;r.players.splice(i,1);if(!r.players.length){delete rooms[code];continue}if(r.started&&alive(r).length<=1){r.started=false;r.phase='over';r.message=alive(r)[0]?`${alive(r)[0].name} gagne 🏆`:'Partie terminée'}else{r.turn=Math.min(r.turn,r.players.length-1);if(r.started&&!r.players[r.turn]?.alive)r.turn=r.players.findIndex(p=>p.alive);emit(r)}}})
});
server.listen(process.env.PORT||3000,()=>console.log('Yaniv Café sur http://localhost:'+(process.env.PORT||3000)));
