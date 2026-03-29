# Elixirs — simple player guide

This is for **members of the Zelda RP community using Tinglebot in Discord** — how elixirs work in your server’s bot. When in doubt, **trust the bot** and ask staff.

---

## The one-minute version

1. **Get** elixirs from loot, shops, RP rewards, trades, or by **brewing** with the bot (if your character is a **Witch** and uses **`/crafting brew`**).
2. **Use / consume** them with **`/item`** (pick your character and the elixir from the list).
3. **Only one elixir buff active at a time.** Wait until the current buff is **used up** or cleared before relying on a different elixir buff (the bot may also block overlapping uses — follow in-bot messages).
4. **Inventory** holds **many bottles** in **separate stacks** (different **Basic / Mid / High**, **Fairy** mix-ins, or brews). **Only one** elixir **buff** is active on your character at a time.
5. Many elixirs give a **buff that lasts until the bot “uses it up”** on a qualifying command (travel, combat, gather, etc.).
6. **Stronger bottles** use **Basic / Mid / High** tiers — your inventory and autocomplete show which stack you’re holding.
7. When **brewing**, ingredients use **effect family** (critters) and **element** (parts); **rarity** and **extra on-theme ingredients** drive the **tier** — **more (good) stuff in the pot → better elixir**.

---

## Basic / Mid / High — what each tier does

**Basic (level 1)** is the baseline bottle. **Mid** and **High** are stronger. Discord embeds may **round** buff numbers for display (e.g. to the nearest **0.25**); the bot still stores and applies the **scaled** values from the code.

### Fixed tier ladders (exact numbers per tier)

These elixirs use **fixed numbers** per tier (see the table). **Resist/stat buffs** use **×1.15** (Mid) and **×1.3** (High) on the base stats (see below).

| Elixir | Basic | Mid | High |
| --- | ---: | ---: | ---: |
| **Hearty Elixir** | +**1** temporary heart | +**2** | +**3** |
| **Energizing Elixir** | +**5** stamina chunks (refill) | +**7** | +**9** |
| **Enduring Elixir** | +**5** stamina chunks to max **and** current | +**7** | +**9** |
| **Fairy Tonic** | Heal cap ≈ **¼** of max hearts (at least **1** heart) | cap ≈ **½** of max (at least **1**) | heal budget = **max hearts** (so you can refill **all** missing HP) |

**Fairy Tonic:** Uses **max hearts** when you use **`/item`**. The bot computes a **heal budget** per tier (quarter / half / full max), then heals **`min(budget, missing hearts)`** up to your **max hearts**. **Fairy** / **Mock Fairy** on the bottle add **extra** hearts on top of tier.

**Hearty, Fairy Tonic, and Enduring** are **one-shot** when you use **`/item`**. **Energizing** uses the chunk ladder above **and** sets an **active buff** until the bot consumes it (see §B).

**Stamina:** refill and extra max use **whole integer chunks**; **5 chunks = 1 wheel** in bot math.

### Buff elixirs (resists, attack, defense, speed, stealth, etc.)

**Chilly, Spicy, Electro, Bright, Sticky, Mighty, Tough, Sneaky, Hasty**, and similar use the bot’s **base** (Basic) stats, then **Mid = ×1.15** and **High = ×1.3** on each effect number, **rounded** to two decimals. **Sticky** scales both **water resistance** and **plus boost**. **Sneaky** scales **stealth** and **flee**. **Hearty / Energizing / Enduring / Fairy Tonic** use the **fixed ladders** in the table above for their main effect.

---

## Commands you actually need

| Command | What it does |
| --- | --- |
| **`/item`** | **Use / consume** an item. This is how you apply an elixir in Discord. Fill in **character name** and **item name** (use autocomplete). For elixirs, use **quantity 1** per use. |
| **`/crafting brew`** | **How Witches make elixirs** — step-by-step **mixer** brew. You pick the elixir line, then **menus** (critter → monster part → optional extras like more parts or **Fairy** / **Mock Fairy**). Ingredients and stamina are spent when the brew **finishes**; **cancel** mid-flow and your ingredients stay put. |
| **`/crafting recipe`** | **Fixed-recipe crafting** for characters with the right **job + item flags** (Cook, Blacksmith, Weaver, etc.). **Witches** make elixirs with **`/crafting brew`**; other jobs use **`/crafting recipe`** for their catalog items. |

**Where you can use them**

- **`/item`** only works in **town hall** channels, the **community board** channel, or **threads inside** those places (plus any staff **test** channel the bot allows).
- **`/crafting`** (including **brew**) is meant for your character’s **village town hall** channel (same idea as other crafting — use the channel the bot asks for).

Use **autocomplete** for character and item names so they match what the bot expects.

---

## Picking the right bottle in `/item` (Basic / Mid / High)

Your **inventory** can hold multiple elixir stacks at once — each **tier**, **Fairy** / **Mock Fairy** add-on, or brew stays its **own stack**. Autocomplete lines show which stack you’re targeting, for example:

- `Hearty Elixir [Basic]`
- `Mighty Elixir [Mid]`
- `Chilly Elixir [High|m2]` (example: extra fairy heal tracked as `m` — pick the line that matches **your** stack)

**Rule of thumb:** the tag in brackets is the **tier** of that **specific** stack. Pick the line that matches what you own. The bot uses **one stack at a time** when you use **`/item`** and tends to use **lower tiers first** unless you pick a specific line — for the bottle you want, **choose the exact autocomplete line** for that stack.

**Reminder:** **Only one active elixir buff at a time** on your character, no matter how many bottles you carry (see below).

---

## What happens when you consume one?

**One buff at a time:** The bot tracks **one** active elixir buff on your character (e.g. one combat-style buff at a time — plan around **one active effect** until it’s consumed or RP/staff say otherwise).

Roughly three cases:

### A) Instant “do the thing” uses

Some bottles apply **right away** as **one-shot** effects when you use **`/item`**:

- **Hearty Elixir** — extra temporary hearts (tier: **Basic +1 / Mid +2 / High +3**).
- **Fairy Tonic** — heals **missing** hearts up to your **max hearts**. Tier sets a **heal budget** from **max hearts**: **Basic** about **¼** of max · **Mid** about **½** · **High** up to **all** missing hearts. **Fairy / Mock Fairy** mix-ins on the bottle add **extra** hearts on top (see brewing below).
- **Enduring Elixir** — adds **extra max stamina** and **current** stamina in **chunks** by tier: **Basic +5 / Mid +7 / High +9** (stamina is counted in **chunks**; **5 chunks = 1 wheel** in bot math).

### B) Buffs that last until the bot consumes them

Most other elixirs set an **active buff** that lasts until a **command or activity** **consumes** it (travel, combat, gather, loot, etc., depending on the elixir).

Below: **what it does in plain English**, **environmental / hazard angles** (where the bot has a resist or explore hook), and **where the bot tends to use it** (combat, travel, gather, etc.). Exact triggers live in the bot — treat this as a **quick reference**.

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
| **Hearty / Fairy Tonic / Enduring** | See section A — **one-shot** on **`/item`** | — | Applied on **`/item`**; stats update in the bot |

**Earth** and **wind** hazards: ask staff which elixirs or rules apply in your server.

### C) Optional: Fairy / Mock Fairy in brewing

If the mixer lets you add **Fairy** or **Mock Fairy**, that can add **bonus hearts when you consume** the finished elixir (on top of the elixir’s normal effect). **Fairy** and **Mock Fairy** count as at least **rarity 5** for **mixer tier** math (see **Rarity, extra ingredients, and Basic / Mid / High** below).

---

## Brewing (`/crafting brew`) — step by step

**Witches:** use **`/crafting brew`** for elixirs. **`/crafting recipe`** is for **other jobs**’ fixed recipes; mixer elixirs use **`brew`**.

1. Your character must be a **Witch** (or whatever your server allows for this command).
2. Run **`/crafting brew`**, choose **character** and the **elixir** you want to make (autocomplete).
3. Follow the **menus**:
   - Pick a **critter** that matches the recipe rules.
   - Pick a **monster part** (often neutral **Chuchu Jelly**; some elixirs need a **colored** jelly or specific element part — the bot will tell you).
   - Optionally add **extras** (more parts or same-family critters, up to the limit the bot shows).
   - **Fairy / Mock Fairy** may be offered as an extra for bonus heal-on-use.
4. **Cancel** anytime before completion — ingredients and stamina spend **when the brew finishes**.
5. When it **completes**, you get the elixir in inventory with a **tier** (**Basic / Mid / High**) from the mixer (the bot shows your **mixer score** on the brew result).

**Note:** Put **Chuchu Jelly** (and similar) in the mixer; **Chuchu Egg** is used elsewhere (e.g. hatch / pet).

---

## Labels, elements, and why the bot cares

In the database, mixer ingredients are **tagged** so the bot knows how they behave in the pot.

| Kind of ingredient | What’s labeled | What it does for you |
| --- | --- | --- |
| **Critters** (bugs, lizards, fairies, etc.) | **Effect family** | Pick a critter whose **family** matches the elixir line (e.g. chilly, mighty, hearty). |
| **Monster parts** (horns, jellies, tails, etc.) | **Element** | Pick parts **allowed** for that brew: often **neutral**; some lines need a **thread** element (e.g. fire for Chilly, ice for Spicy, electric for Electro, undead-adjacent for Bright). |

**Family** on the critter + **element** on the part (when it matters) make a **legal** mix. Staff can add or adjust **effect family** / **element** tags on catalog rows so ingredients show up correctly in the mixer.

---

## Rarity, extra ingredients, and Basic / Mid / High

**Every ingredient has a rarity** (a number, typically **1–10** on the item). The mixer uses **all** ingredients you put in the pot — base critter, base part, **and** optional extras — to decide how strong the **finished bottle** is.

**Plain rules:**

1. **Higher rarity = stronger contribution.** Your **best** single ingredient counts **extra** compared to the **average** of everything — so one amazing drop can carry a brew, but a pile of weak stuff drags the average down.
2. **Fairy / Mock Fairy** are very useful in RP, so for **tier** math the bot treats them as at least **rarity 5**. **Mix-in** hearts from Fairies are tracked **separately** on the inventory stack.
3. **More valid ingredients usually means a better elixir**, because you add more rarity into the mix **and** you can unlock **synergy** (see below). Extras must be **allowed** by the bot’s menus (same-family critters, matching parts, or Fairy / Mock Fairy where offered).
4. **Synergy (extras that match the theme):** optional extras that are **on-brand** for the brew — for example, **another critter from the same effect family**, or (on elixirs that use a **thread element**) **another part with that element** — add a **small bonus** toward a higher tier. The bot counts those and folds them into the score.

**Tier bands (after the bot combines rarity + synergy into one score from 1–10):**

- **1–3** → **Basic**  
- **4–6** → **Mid**  
- **7–10** → **High**  

You’ll see the tier on the crafted item. **Fairy / Mock Fairy** extras also add **bonus heal when you consume** the bottle on top of tier.

Remember: **rarer parts, smart extras, on-theme ingredients, and Fairies where allowed → better bottles.**

---

## Quick reminders

- Use **`/item`** in **town hall**, **community board**, or **threads** there (or staff **test** channels the bot allows).
- Prefer **autocomplete** for character and item names.
- Use **quantity 1** per **`/item`** for elixirs.
- **One active elixir buff** at a time; lots of bottles in inventory is fine.
- **Witches:** mixer elixirs come from **`/crafting brew`**.
- **Chilly** = heat / fire · **Sticky** = water · **Bright** = blight.
- Use **labeled** mixer **critters** and **parts** from the menus; ask staff if you’re unsure about a specific item.

---

## Need more detail?

Staff keep technical mixer notes in the repo. When in doubt, **trust the bot** and ask staff.
