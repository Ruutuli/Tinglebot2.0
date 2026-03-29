# Elixirs — simple player guide

This is for **members of the Zelda RP community using Tinglebot in Discord** — not a separate video game. If anything here disagrees with what the bot replies in your server, **trust the bot** and ask staff.

---

## The one-minute version

1. **Get** elixirs from loot, shops, RP rewards, trades, or by **brewing** with the bot (if your character is a **Witch** and uses **`/crafting brew`**).
2. **Use / consume** them with **`/item`** (pick your character and the elixir from the list).
3. **Only one elixir buff active at a time** — buff effects **do not stack**. Wait until the current buff is **used up** or cleared before relying on a different elixir buff (the bot may also block overlapping uses — follow in-bot messages).
4. **Inventory** is different: you can own **many bottles** and they can sit in **separate stacks** (different **Basic / Mid / High**, different **Fairy** mix-ins, different brews) — that’s **not** the same as stacking buffs.
5. Many elixirs give a **buff that lasts until the bot “uses it up”** on a qualifying command (travel, combat, gather, etc.) — not a real-world countdown timer.
6. **Stronger bottles** use **Basic / Mid / High** tiers — your inventory and autocomplete show which stack you’re holding.
7. When **brewing**, ingredients use **effect family** (critters) and **element** (parts); **rarity** and **extra on-theme ingredients** drive the **tier** — **more (good) stuff in the pot → better elixir**.

---

## Basic / Mid / High — what each tier does

**Basic (level 1)** is the baseline bottle. **Mid** and **High** are stronger. Discord embeds may **round** buff numbers for display (e.g. to the nearest **0.25**); the bot still stores and applies the **scaled** values from the code.

### Fixed tier ladders (exact numbers per tier)

These elixirs use **explicit Basic / Mid / High values** wired in the bot — **not** the **×1.15 / ×1.3** rule used for resist/stat buffs below.

| Elixir | Basic | Mid | High |
| --- | ---: | ---: | ---: |
| **Hearty Elixir** | +**1** temporary heart | +**2** | +**3** |
| **Energizing Elixir** | +**5** stamina chunks (refill) | +**7** | +**9** |
| **Enduring Elixir** | +**5** stamina chunks to max **and** current | +**7** | +**9** |
| **Fairy Tonic** | Heal cap ≈ **¼** of max hearts (at least **1** heart) | cap ≈ **½** of max (at least **1**) | heal budget = **max hearts** (so you can refill **all** missing HP) |

**Fairy Tonic:** Uses **max hearts** when you use **`/item`**. The bot computes a **heal budget** per tier (quarter / half / full max), then heals **`min(budget, missing hearts)`** — never above your real max. **Fairy** / **Mock Fairy** on the bottle add **extra** hearts on top; that is **separate** from tier.

**Hearty, Fairy Tonic, and Enduring** are one-shot on **`/item`** (no lingering elixir buff). **Energizing** uses the chunk ladder above **and** also sets an **active buff** until the bot consumes it (see §B).

**Stamina:** refill and extra max use **whole integer chunks**; **5 chunks = 1 wheel** in bot math (same convention as `ELIXIR_EFFECTS` / docs).

### Buff elixirs (resists, attack, defense, speed, stealth, etc.)

**Chilly, Spicy, Electro, Bright, Sticky, Mighty, Tough, Sneaky, Hasty**, and similar use the bot’s **base** (Basic) stats, then **Mid = ×1.15** and **High = ×1.3** on each effect number, **rounded** to two decimals. **Sticky** scales both **water resistance** and **plus boost**. **Sneaky** scales **stealth** and **flee**. **Hearty / Energizing / Enduring / Fairy Tonic** use the **fixed ladders** above instead of this multiplier for their main effect.

---

## Commands you actually need

| Command | What it does |
| --- | --- |
| **`/item`** | **Use / consume** an item. This is how you apply an elixir in Discord. Fill in **character name** and **item name** (use autocomplete). For elixirs, you can only use **quantity 1** at a time. |
| **`/crafting brew`** | **How Witches make elixirs** — step-by-step **mixer** brew. You pick the elixir line, then **menus** (critter → monster part → optional extras like more parts or **Fairy** / **Mock Fairy**). Ingredients and stamina are spent when the brew **finishes**; if you **cancel** mid-flow, **nothing** is taken. |
| **`/crafting recipe`** | **Fixed-recipe crafting** for characters with the right **job + item flags** (Cook, Blacksmith, Weaver, etc.). **Witches do not use this to make elixirs** — elixir crafting for Witches is **`/crafting brew`** only. Other jobs use **`/crafting recipe`** for their own catalog items as usual. |

**Where you can use them**

- **`/item`** only works in **town hall** channels, the **community board** channel, or **threads inside** those places (plus any staff **test** channel the bot allows).
- **`/crafting`** (including **brew**) is meant for your character’s **village town hall** channel (same idea as other crafting — if the bot says “wrong channel,” move to the place it names).

Always use **autocomplete** for character and item names so you don’t typo.

---

## Picking the right bottle in `/item` (Basic / Mid / High)

Your **inventory** can hold multiple elixir stacks at once — they **don’t merge** into one mega-stack if they were brewed differently (different **tier**, **Fairy** / **Mock Fairy** heal add-on, or separate brews). Autocomplete lines show which stack you’re targeting, for example:

- `Hearty Elixir [Basic]`
- `Mighty Elixir [Mid]`
- `Chilly Elixir [High|m2]` (example: extra fairy heal tracked as `m` — pick the line that matches **your** stack)

**Rule of thumb:** the tag in brackets is the **tier** of that **specific** stack. Pick the line that matches what you own. The bot uses **one stack at a time** when you use **`/item`** and tends to use **lower tiers first** if you don’t pick a line — so if you care about potency, **always choose the exact autocomplete line** for the stack you want.

**Reminder:** many stacks in inventory ≠ many buffs stacked. **Only one active elixir buff at a time** on your character (see below).

---

## What happens when you consume one?

**One buff at a time:** The bot tracks **one** active elixir buff on your character. You **cannot** stack multiple elixir combat buffs (e.g. Mighty + Tough at once). Plan around **one active effect** until it’s consumed or RP/staff say otherwise.

Roughly three cases:

### A) Instant “do the thing” uses

Some bottles apply **right away** and **do not** leave a long-term buff in the same way as resist elixirs. Treat these as **one-shot** when you use **`/item`**:

- **Hearty Elixir** — extra temporary hearts (tier: **Basic +1 / Mid +2 / High +3**).
- **Fairy Tonic** — heals **missing** hearts only (never above your **real** max). Tier sets a **heal budget** from your **max hearts**: **Basic** about **¼** of max · **Mid** about **½** · **High** up to **all** missing hearts. **Fairy / Mock Fairy** mix-ins on the bottle add **extra** hearts on top (see brewing below).
- **Enduring Elixir** — adds **extra max stamina** and **current** stamina in **chunks** by tier: **Basic +5 / Mid +7 / High +9** (stamina is counted in **chunks**; **5 chunks = 1 wheel** in bot math).

### B) Buffs that last until the bot consumes them

Most other elixirs set an **active buff**. It does **not** run out after 10 minutes in real time. It goes away when a **command or activity the bot cares about** **consumes** that buff (travel, combat, gather, loot, etc., depending on the elixir).

Below: **what it does in plain English**, **environmental / hazard angles** (where the bot has a resist or explore hook), and **where the bot tends to use it** (combat, travel, gather, etc.). Exact triggers are in the bot logic — use this as a **cheat sheet**, not a legal contract.

| Elixir | Plain English | Environmental / hazards (where relevant) | Where the bot uses it (examples) |
| --- | --- | --- | --- |
| **Chilly Elixir** | Heat and **fire** resistance | **Hot** regions / heat hazards; pairs with **fire**-aligned threats | Combat vs fire-type enemies; **explore** / travel where **hot** hazard applies; **loot** / **raid** when relevant |
| **Spicy Elixir** | **Cold** and **ice** resistance | **Cold** ambient / frost hazards | Combat vs ice-type enemies; **explore** / travel where **cold** hazard applies |
| **Electro Elixir** | **Shock / lightning** resistance | **Thunder** / storm-style hazards | Combat vs electric enemies; **explore** where **thunder** hazard applies |
| **Bright Elixir** | **Blight** resistance | Bad weather / blight conditions the bot checks | **Travel**, **gather**, **loot**, **raid**, **help wanted** when **blight** is in play |
| **Sticky Elixir** | **Water** resistance + yield-style bonus | **Wet** / water-heavy situations | Combat vs water-type foes; **loot**; **gather** where wired |
| **Energizing Elixir** | Stamina **refill** when consumed (**Basic +5 / Mid +7 / High +9** chunks); ongoing buff when active | — | **Gather**, **loot**, **crafting** (consumption rules); **stamina** actions |
| **Hasty Elixir** | **Speed** — shorter travel | — | **Travel** (often consumes the buff) |
| **Mighty Elixir** | **Attack** up | — | **Combat**, **help wanted**, **loot**, **raid** |
| **Tough Elixir** | **Defense** up | — | **Combat**, **help wanted**, **loot**, **raid** |
| **Sneaky Elixir** | **Stealth** + **flee** | — | **Gather**, **loot**, **travel** |
| **Hearty / Fairy Tonic / Enduring** | See section A — instant, not a long buff like the rows above | — | Applied on **`/item`**; stats update in the bot |

**Earth** and **wind** hazards don’t have a dedicated elixir row in the bot right now — ask staff if you’re unsure.

### C) Optional: Fairy / Mock Fairy in brewing

If the mixer lets you add **Fairy** or **Mock Fairy**, that can add **bonus hearts when you consume** the finished elixir (on top of the elixir’s normal effect). **Fairy** and **Mock Fairy** also count as **stronger** than a plain “rarity 1” for **mixer tier** math (see **Rarity, extra ingredients, and Basic / Mid / High** below).

---

## Brewing (`/crafting brew`) — step by step

**Witches:** use **`/crafting brew`** for elixirs. Do **not** expect **`/crafting recipe`** to be your elixir pipeline — that subcommand is for **other jobs** and fixed recipes; **mixer elixirs** are **`brew`** only.

1. Your character must be a **Witch** (or whatever your server allows for this command).
2. Run **`/crafting brew`**, choose **character** and the **elixir** you want to make (autocomplete).
3. Follow the **menus**:
   - Pick a **critter** that matches the recipe rules.
   - Pick a **monster part** (often neutral **Chuchu Jelly**; some elixirs need a **colored** jelly or specific element part — the bot will tell you).
   - Optionally add **extras** (more parts or same-family critters, up to the limit the bot shows).
   - **Fairy / Mock Fairy** may be offered as an extra for bonus heal-on-use.
4. **Cancel** anytime before completion — **no refund drama** because nothing was consumed yet.
5. When it **completes**, you get the elixir in inventory with a **tier** (**Basic / Mid / High**) from the mixer (the bot shows your **mixer score** on the brew result).

**Note:** **Chuchu Egg** is **not** a mixer ingredient — use **Chuchu Jelly** (and similar) instead.

---

## Labels, elements, and why the bot cares

Mixer ingredients are not random loot with pretty names — in the database, items are tagged so the bot knows how they behave in the pot.

| Kind of ingredient | What’s labeled | What it does for you |
| --- | --- | --- |
| **Critters** (bugs, lizards, fairies, etc.) | **Effect family** | Decides **which elixir line** you’re brewing toward (e.g. chilly, mighty, hearty). Wrong family → wrong bottle or the bot says no. |
| **Monster parts** (horns, jellies, tails, etc.) | **Element** | Decides **which parts are allowed** for that brew. Many elixirs allow **neutral** parts; some need a **thread** element (e.g. fire for Chilly, ice for Spicy, electric for Electro, undead-adjacent for Bright). The bot only accepts parts whose **element** matches the rules for that elixir. |

So: **family** on the critter + **element** on the part (when it matters) control **whether the mix is legal**. If something matches Zelda lore but fails in the bot, it’s usually because that catalog row is missing the right **effect family** or **element** tag — that’s a staff/database fix, not something you can fix in Discord.

---

## Rarity, extra ingredients, and Basic / Mid / High

**Every ingredient has a rarity** (a number, typically **1–10** on the item). The mixer uses **all** ingredients you put in the pot — base critter, base part, **and** optional extras — to decide how strong the **finished bottle** is.

**Plain rules:**

1. **Higher rarity = stronger contribution.** Your **best** single ingredient counts **extra** compared to the **average** of everything — so one amazing drop can carry a brew, but a pile of weak stuff drags the average down.
2. **Fairy / Mock Fairy** are very useful in RP, so for **tier** math the bot treats them as at least **rarity 5** even if the catalog row says **1**. (Heal-on-use from Fairies is **separate** — that’s the **mix-in** hearts on the inventory stack.)
3. **More valid ingredients usually means a better elixir**, because you add more rarity into the mix **and** you can unlock **synergy** (see below). You still have to follow the bot’s menus: you can’t throw random junk in; extras must be **allowed** (same-family critters, matching parts, or Fairy / Mock Fairy where offered).
4. **Synergy (extras that match the theme):** optional extras that are **on-brand** for the brew — for example, **another critter from the same effect family**, or (on elixirs that use a **thread element**) **another part with that element** — add a **small bonus** toward a higher tier. The bot counts those and folds them into the score.

**Tier bands (after the bot combines rarity + synergy into one score from 1–10):**

- **1–3** → **Basic**  
- **4–6** → **Mid**  
- **7–10** → **High**  

You’ll see the tier on the crafted item; you don’t need to track the number yourself. **Fairy / Mock Fairy** extras also add **bonus heal when you consume** the bottle (separate from tier), as the brew message explains.

You don’t need to do math by hand — just remember: **rarer parts, smart extras, on-theme ingredients, and Fairies where allowed → better bottles.**

---

## Quick mistakes to avoid

- Using **`/item`** in a random channel → bot will say **wrong channel**; move to town hall or community board.
- Typing item names by hand → use **autocomplete**.
- Trying to chug **more than one elixir per `/item`** → set **quantity** to **1** for elixirs.
- Expecting **multiple elixir buffs** at once — **only one active buff**; inventory quantity is **not** the same thing.
- Using **`/crafting recipe`** as a **Witch** to mass-produce elixirs — use **`/crafting brew`** for mixer elixirs.
- Expecting **Chilly** to help in **water** or **blight** — that’s **Sticky** / **Bright**, not Chilly.
- Expecting **Bright** to replace **Chilly** for fire — **Chilly** is the heat/fire one.
- Thinking **every** bug or horn counts in the mixer — only items the bot recognizes as labeled **critters** or **parts** count; if the bot rejects an item, it’s not set up as a mixer ingredient.

---

## Need more detail?

Staff keep technical mixer notes in the repo. If anything disagrees with the bot, **trust the bot** and ask staff.
