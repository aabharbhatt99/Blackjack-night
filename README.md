# Blackjack Night (Cloudflare)

Deploy (free Cloudflare account):
1. npm install
2. npx wrangler login
3. npx wrangler deploy   -> prints https://blackjack-night.<you>.workers.dev

Up to 10 people can join a lobby (the dealer plus 9 players).

Test alone on your computer:
  npx wrangler dev  -> open http://localhost:8787 in a normal window, an Incognito window
  and another browser; each one is a separate player.

How a round works
- Betting (right panel): players tap 1/5/10/25/50 chips, or ALL IN for their whole balance,
  and lock their bet. Bets show as chip stacks in front of each seat for the whole round.
  The dealer chooses whether their own first card will be face up or face down.
- Deal: everyone gets ONE card face down. Nobody can see any card, not even their own.
- Turns go clockwise from the dealer's left: your card flips for everyone, a second card is
  dealt face up, then Hit or Stand on the table (keys H / S). The dealer plays last and must
  reach 17. A bust sends that player's chips to the dealer pool straight away.
- Payout: when the round ends, lost bets slide to the dealer pool and the dealer pays each
  winner. Balances only change at that moment.
- Bankrupt dealer: the dealer pays from their chips plus this round's lost bets. If that
  isn't enough, half of it is split equally among all winners, and the rest goes to the best
  hands first (blackjack, then 21, 20, ...). Players with the same hand share equally. The
  dealer ends on 0.
- Knocked out: anyone on 0 chips watches from their seat and is skipped for dealing and
  betting. When fewer than 2 players have chips, the game is over and the host can reset.
- Next round: the next player clockwise moves into the dealer chair and everyone
  shifts one seat.
