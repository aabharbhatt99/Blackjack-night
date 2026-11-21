# Table redesign plan

Status: **all 5 steps implemented (2026-11-21), ready for local testing.**

Mockup: https://claude.ai/artifact/6d3HDJv3N4KGpJhn5Sqjkq (3 screens: Betting, Your turn, Round over)

## Decisions made

- **All in** means betting your whole balance. You still tap **Lock bet** to confirm.
- **Balance** stays as it is until the round ends. Seat plates and the panel show the full
  balance during the round. It changes only at settle.
- **Seating** keeps the current rotation: the dealer is at the top and the other seats follow
  clockwise. Your seat is highlighted instead: a gold plate with a glowing **YOU** badge and
  your name in gold. Your row in the player list is gold too.
- **Betting controls stay in the right panel**: chip buttons, ALL IN, Clear and Lock bet.
  Only **Hit / Stand** and **Deal next round** move onto the table.

We do one step at a time. After each step: test it locally (`npx wrangler dev`, with 3 or more
browser windows as different players), approve it, then start the next step.

---

## Requirements

1. **All in**: a one-tap bet of your whole balance.
2. **Bets on the table as chips**: every player's bet sits as a chip stack in front of their seat
   for the whole round, including after their turn. When a player busts, their chips slide to a
   **dealer pool** beside the dealer. Chips move between players and the dealer with animation.
   Winners get paid only at the end of the round, after the dealer busts or loses to them.
3. **Table-first layout**: Hit/Stand (and betting/results controls) move onto the table, in a
   dock at the center of the felt. The side panel becomes a slimmer, quieter info panel.

---

## Step 1: All in button  `[x]`

- **Server** (`src/worker.js`, `onMsg`): add `case "allin"`. It uses the same guard as `bet`
  (betting phase, not ready, not dealer) and sets `p.bet = p.chips`. The player still taps
  **Lock bet** to confirm.
- **Client** (`public/index.html`): add a full-width **ALL IN · {balance}** button in the
  right panel's betting area, between the chip row and the Clear / Lock bet row. When `bet === chips`, the seat plate and the player list say **All in**.
- Check: tap All in and the bet equals your balance. Lock it, lose, and you're at 0 ("Out of
  chips" next round). Clear still resets the bet.

## Step 2: Layout, Hit/Stand on the table, a slimmer side panel, your seat highlighted  `[x]`

- Add a `.dock` element inside `#stage`, centered on the felt above the player arc:
  - Your turn: hand total, the dealer's up card, your bet, **HIT** and **STAND** (H/S
    shortcuts stay).
  - Round over: your result, "Balance 500 → 520", **Deal next round**, and who deals next.
  - Any other time: no dock. The existing center text shows instead ("Place your bets",
    "Sam's turn").
- Make the side panel 320px wide (down from 400px):
  - Betting phase: the betting controls stay here (status and progress bar, Balance / Current
    bet, chip buttons, ALL IN, Clear, Lock bet). The dealer's face-down / face-up toggle also
    stays here.
  - Other phases: round and phase status, Balance / Bet this round, the player list (adds a
    **bet** column), and Leave / Reset.
- Highlight your seat: a gold 2px border and glow on your plate, a **YOU** badge on its top
  edge, and your name in gold. Seat rotation doesn't change.
- Mobile (≤860px): keep the dock outside the scaled stage, pinned to the bottom of the table
  area, so Hit/Stand stay full size. The side panel collapses under the table as it does now.
- Check: Hit/Stand works from the table by click and by H/S. Betting still works from the
  panel. You can find your seat at a glance in any seat position. Nothing overlaps at
  1280×720, 1920×1080 or phone width.

## Step 3: Bets shown as chips on the felt  `[x]`

- Each seat gets a **bet spot**: a dashed ring in front of the seat, toward the table center,
  with a chip stack and an amount pill.
  - The amount is broken into chips greedily (50/25/10/5/1) and drawn as small stacked piles,
    with a cap on chips per pile.
  - The stack stays visible from the moment you bet until the round is settled.
  - Pill states: `25` while betting, `25 ✓` when locked, `ALL IN 85`, `Bust −10`, `Win +20`,
    `Push`.
- Add a **dealer pool** tray beside the dealer seat. It holds the chips lost this round, with
  the amount and where they came from.
- Seat plates keep showing the full balance until the round ends.
- The server already sends `bet` and `status`. The pool amount can be computed on the client
  from busted players' bets, so no server change is expected.

## Step 4: Chip animations  `[x]`

- Use the Web Animations API, like the existing `flyFromDeck`, measuring in stage coordinates.
- **Bust**: the moment a player's status turns `bust`, their stack flies from their bet spot
  to the dealer pool.
- **Settle** (results phase), staggered clockwise:
  1. Plain losses (not busts) fly to the dealer pool.
  2. The dealer pays each winner: a payout pile flies from the dealer to the winner's spot and
     sits next to the original bet. Blackjack pays 3:2. A push stays where it is.
  3. After about 1.5 s, winners' chips sweep into their plate and the pool sweeps into the
     dealer's plate. This is the moment the balances change.
- Only animate transitions that happen live, not on reconnect or first render. Track the
  previous status and bet per player, the same way `prevHands` does now.
- `prefers-reduced-motion`: skip the flights and just update the stacks.
- Edge cases: everyone busts (the dealer never plays), a disconnected player is auto-played,
  the dealer has blackjack, an all-in player busts.

## Step 5: Bankrupt dealer  `[x]`

**When it applies.** At settle, the dealer's **bank** is their chips plus every losing bet this
round, busts included. If the winners are owed more than the bank holds, the dealer is
bankrupt. The whole bank is paid out and the dealer ends on 0.

**Splitting the bank** (whole chips only, and nobody gets more than they're owed):
1. **Guarantee:** half the bank is split equally among all winners, so every winner gets
   something.
2. **Priority:** the rest goes to winners by hand, best first. Blackjack ranks above a plain 21,
   then 21, 20, 19 and so on. Each winner is topped up until they've received what they're owed.
3. **Ties:** players with the same hand split their tier's money equally. If one of them needs
   less, the spare goes to the others in the same tier.
4. **Odd chips:** a split that leaves one or more chips over hands them out one at a time,
   clockwise from the dealer's left.
5. **Bank smaller than the number of winners:** there aren't enough chips to give everyone
   one, so 1 chip each goes out in priority order until the bank runs out.

**Knocked out.** Any player on 0 chips is out:
- The seat is greyed and marked "Knocked out". They stay at the table to watch.
- They're skipped in the dealer rotation and in betting.
- The "next dealer" label skips them too, so it's correct during results.
- Game over when fewer than 2 players have chips: "{name} wins the table". The host's Reset
  puts everyone back at their starting chips.

**On screen** (mockups 4–6 on the canvas):
- **Bankrupt round:**
  - The bank tray shows "Bank shared out · 60 = 50 chips + 10 lost".
  - The results box says "Dealer is bankrupt: payouts were shared".
  - A partly paid winner shows "Win +18 of 20" in gold. A fully paid winner stays green.
  - The dealer's plate shows "BANKRUPT · Knocked out".
  - The right panel adds a **"How the bank was shared"** table: player, hand, owed, paid.
- **Next round:** the knocked-out player's seat is greyed with an OUT tag and has no bet ring.
  The betting count leaves them out ("3 of 4 locked"), and the list marks them "Knocked out ·
  skipped".
- **Game over:**
  - The table shows the winner's plate with their chips, and everyone else greyed with
    "Out in round N".
  - The box in the middle has the host's **Reset game · everyone back to {start}** button.
    Everyone else sees "Waiting for the host to reset".
  - The right panel shows **final standings**: the winner first, then the others ordered by
    the round they went out, the last one out ranked highest. The server records each
    player's `outRound` for this.

