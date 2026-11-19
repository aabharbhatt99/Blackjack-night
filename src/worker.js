// Blackjack Night: one Durable Object per lobby code = authoritative game server.
// Flow: betting -> every player gets ONE face-down card -> on each turn (clockwise from
// the dealer's left) that card flips for everyone, a second card is dealt face up, then
// hit/stand. Dealer plays last. The dealer chooses whether their first card is face up.
const CH = [1, 5, 10, 25, 50];
const val = h => { let t = 0, a = 0; for (const c of h) { const r = c.slice(0, -1); if (r === "A") { a++; t += 11 } else if ("JQK".includes(r)) t += 10; else t += +r } while (t > 21 && a) { t -= 10; a-- } return t };
const mkDeck = () => { const d = []; for (const s of "♠♥♦♣") for (const r of ["A", 2, 3, 4, 5, 6, 7, 8, 9, 10, "J", "Q", "K"]) d.push(r + s); for (let i = d.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0;[d[i], d[j]] = [d[j], d[i]] } return d };

export default {
  fetch(req, env) {
    const u = new URL(req.url);
    if (u.pathname !== "/ws") return new Response("Not found", { status: 404 });
    if (req.headers.get("Upgrade") !== "websocket") return new Response("Expected websocket", { status: 426 });
    const code = (u.searchParams.get("code") || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    if (!code) return new Response("Missing code", { status: 400 });
    return env.TABLE.get(env.TABLE.idFromName(code)).fetch(req);
  }
};

export class Table {
  constructor() {
    this.socks = new Map(); this.deck = [];
    this.s = { phase: "lobby", host: null, start: 500, round: 0, dealer: null, turn: null, idx: -1, seq: [], players: [], msg: "", showFirst: false };
  }
  async fetch() {
    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    server.addEventListener("message", e => { try { this.onMsg(server, JSON.parse(e.data)) } catch (err) { console.log(String(err)) } });
    const close = () => this.onClose(server);
    server.addEventListener("close", close); server.addEventListener("error", close);
    return new Response(null, { status: 101, webSocket: client });
  }
  draw() { if (this.deck.length < 15) this.deck = mkDeck(); return this.deck.pop() }
  P(id) { return this.s.players.find(p => p.id === id) }
  online() { return this.s.players.filter(p => p.online) }

  join(ws, m) {
    const S = this.s, id = String(m.pid || "").slice(0, 40), name = (String(m.name || "").trim().slice(0, 16)) || "Player";
    const fail = msg => { try { ws.send(JSON.stringify({ t: "error", msg })); ws.close() } catch { } };
    if (!id) return;
    let p = this.P(id);
    if (!S.host) {
      if (!m.create) return fail("No lobby with that code.");
      S.start = Math.min(100000, Math.max(10, parseInt(m.start) || 500)); S.host = id;
    } else if (m.create && !p) return fail("That code is taken, try again.");
    if (!p) {
      if (S.players.length >= 8) return fail("Lobby is full (8 players).");
      p = { id, name, chips: S.start, online: true, bet: 0, ready: false, in: false, hand: [], revealed: false, status: "", res: null };
      S.players.push(p);
    }
    p.name = name; p.online = true;
    for (const [w, i] of this.socks) if (i === id) { this.socks.delete(w); try { w.close() } catch { } }
    this.socks.set(ws, id);
    if (S.phase === "betting") this.maybeDeal();
    this.broadcast();
  }

  onMsg(ws, m) {
    if (m.t === "ping") return;
    if (m.t === "join") return this.join(ws, m);
    const S = this.s, pid = this.socks.get(ws), p = pid && this.P(pid);
    if (!p) return;
    const betting = S.phase === "betting" && !p.ready && pid !== S.dealer;
    switch (m.t) {
      case "start": if (S.phase === "lobby" && pid === S.host && this.online().length >= 2) this.newRound(); break;
      case "next": if (S.phase === "results" && this.online().length >= 2) this.newRound(); break;
      case "reset": if (pid === S.host) {
        S.players = S.players.filter(x => x.online);
        S.players.forEach(x => Object.assign(x, { chips: S.start, bet: 0, ready: false, in: false, hand: [], revealed: false, status: "", res: null }));
        Object.assign(S, { phase: "lobby", dealer: null, turn: null, seq: [], round: 0, msg: "", showFirst: false });
      } break;
      case "dshow": if (S.phase === "betting" && pid === S.dealer) S.showFirst = !!m.show; break;
      case "bet": if (betting && CH.includes(m.amount) && p.bet + m.amount <= p.chips) p.bet += m.amount; break;
      case "clear": if (betting) p.bet = 0; break;
      case "ready": if (betting && p.bet >= 1) { p.ready = true; this.maybeDeal() } break;
      case "hit": if (S.phase === "playing" && S.turn === pid) this.hit(p); break;
      case "stand": if (S.phase === "playing" && S.turn === pid) this.stand(p); break;
    }
    this.broadcast();
  }

  onClose(ws) {
    const S = this.s, pid = this.socks.get(ws);
    if (!pid) return;
    this.socks.delete(ws);
    const p = this.P(pid); if (!p) return;
    p.online = false;
    if (S.phase === "lobby") S.players = S.players.filter(x => x !== p);
    if (S.host === pid) { const h = this.online()[0]; if (h) S.host = h.id }
    if (S.phase === "betting") this.maybeDeal();
    else if (S.phase === "playing" && S.turn === pid) { this.auto(p); this.advance() }
    this.broadcast();
  }

  nextDealer() {
    const ps = this.s.players, cur = ps.findIndex(p => p.id === this.s.dealer);
    for (let k = 1; k <= ps.length; k++) { const p = ps[(cur + k + ps.length) % ps.length]; if (p.online) return p.id }
    return null;
  }
  newRound() {
    const S = this.s; S.round++; S.phase = "betting"; S.msg = ""; S.showFirst = false;
    S.dealer = S.dealer == null ? this.online()[0].id : this.nextDealer();
    S.players.forEach(p => Object.assign(p, { bet: 0, ready: p.id === S.dealer, in: false, hand: [], revealed: false, status: "", res: null }));
    S.seq = []; S.turn = null; this.maybeDeal();
  }
  maybeDeal() {
    const S = this.s; if (S.phase !== "betting") return;
    const b = S.players.filter(p => p.online && p.id !== S.dealer && p.chips >= 1);
    if (!b.length) { S.msg = "Waiting for players who have chips (the host can reset the game)."; return }
    S.msg = ""; if (b.every(p => p.ready)) this.deal(b);
  }
  deal(bettors) {
    const S = this.s, d = this.P(S.dealer), ps = S.players;
    S.phase = "playing";
    const di = ps.indexOf(d); S.seq = [];
    for (let k = 1; k <= ps.length; k++) { const p = ps[(di + k) % ps.length]; if (p === d || bettors.includes(p)) S.seq.push(p.id) } // clockwise, dealer last
    S.seq.forEach(id => { const p = this.P(id); p.in = true; p.hand = [this.draw()]; p.revealed = false; p.status = "wait" });
    S.idx = -1; this.advance();
  }
  // a player's turn begins: their face-down card flips and a second card is dealt face up
  startTurn(p) { p.revealed = true; p.hand.push(this.draw()); p.status = val(p.hand) === 21 ? "bj" : "play" }
  auto(p) { if (!p.revealed) this.startTurn(p); while (val(p.hand) < 17) p.hand.push(this.draw()); p.status = val(p.hand) > 21 ? "bust" : (p.status === "bj" ? "bj" : "stand") }
  advance() {
    const S = this.s;
    for (; ;) {
      S.idx++;
      if (S.idx >= S.seq.length) return this.settle();
      const p = this.P(S.seq[S.idx]);
      if (p.id === S.dealer && !S.seq.some(id => id !== S.dealer && this.P(id).status === "stand")) return this.settle(); // nobody left to beat
      this.startTurn(p);
      if (p.status !== "play") continue;          // blackjack: turn ends at once
      S.turn = p.id;
      if (p.online) return;
      this.auto(p);                                 // disconnected player: plays by house rules
    }
  }
  hit(p) { p.hand.push(this.draw()); const v = val(p.hand); if (v > 21) { p.status = "bust"; this.advance() } else if (v === 21) { p.status = "stand"; this.advance() } }
  stand(p) { if (p.id === this.s.dealer && val(p.hand) < 17) return; p.status = "stand"; this.advance() }
  settle() {
    const S = this.s, d = this.P(S.dealer);
    S.phase = "results"; S.turn = null;
    S.players.forEach(p => { if (p.in) p.revealed = true });
    if (d.hand.length < 2) { d.hand.push(this.draw()); if (val(d.hand) === 21) d.status = "bj" }
    const dv = val(d.hand), dbj = d.status === "bj"; let sum = 0;
    for (const p of S.players) {
      if (!p.in || p === d) continue;
      const pv = val(p.hand), bj = p.status === "bj"; let o, dl;
      if (pv > 21) { o = "Bust"; dl = -p.bet }
      else if (bj && !dbj) { o = "Blackjack!"; dl = Math.floor(p.bet * 1.5) }
      else if (dbj && !bj) { o = "Lose"; dl = -p.bet }
      else if (bj && dbj) { o = "Push"; dl = 0 }
      else if (dv > 21 || pv > dv) { o = "Win"; dl = p.bet }
      else if (pv < dv) { o = "Lose"; dl = -p.bet }
      else { o = "Push"; dl = 0 }
      p.chips += dl; sum += dl; p.res = { o, dl };
    }
    d.chips -= sum; d.res = { o: "Dealer", dl: -sum };
  }

  view(me) {
    const S = this.s;
    return {
      t: "state", me, phase: S.phase, host: S.host, start: S.start, round: S.round, dealer: S.dealer, showFirst: S.showFirst,
      next: S.phase === "lobby" ? null : this.nextDealer(), turn: S.turn, msg: S.msg, deck: this.deck.length || 52,
      players: S.players.map(p => {
        let hand = p.hand;
        if (!p.revealed) hand = p.id === S.dealer && S.showFirst ? p.hand.slice() : p.hand.map(() => null); // nobody peeks, not even the owner
        return { id: p.id, name: p.name, chips: p.chips, online: p.online, bet: p.bet, ready: p.ready, in: p.in, revealed: p.revealed, status: p.status, res: p.res, hand };
      })
    };
  }
  broadcast() { for (const [ws, pid] of this.socks) { try { ws.send(JSON.stringify(this.view(pid))) } catch { } } }
}
