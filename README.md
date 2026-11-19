# Blackjack Night (Cloudflare)

Deploy (free Cloudflare account):
1. npm install
2. npx wrangler login
3. npx wrangler deploy   -> prints https://blackjack-night.<you>.workers.dev

Test alone on your computer:
  npx wrangler dev  -> open http://localhost:8787 in a normal window, an Incognito window
  and another browser; each one is a separate player.

How a round works
- Betting: players tap 1/5/10/25/50 chips and lock their bet. The dealer chooses whether
  their own first card will be face up or face down.
- Deal: everyone gets ONE card face down. Nobody can see any card, not even their own.
- Turns go clockwise from the dealer's left: your card flips for everyone, a second card is
  dealt face up, then Hit or Stand (keys H / S). The dealer plays last and must reach 17.
- Next round: the next player clockwise moves into the dealer chair and everyone
  shifts one seat.
