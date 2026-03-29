# Elixirs — simple player guide

For **Zelda RP** servers using **Tinglebot** in Discord. When in doubt, **trust the bot** and ask staff.

---

## Start here

| You want to… | Do this |
| --- | --- |
| **Use** an elixir | **`/item`** → your **character** + elixir from **autocomplete** (quantity **1**). Works in **town hall**, **community board**, or **threads** there (plus staff **test** channels if allowed). |
| **Brew** an elixir | **`/crafting brew`** (usually **Witches**, in your **village town hall**). |
| **Know which bottle to bring** | See **Pick an elixir for the situation** (below). |
| **See numbers by tier** | See **Tiers: Basic, Mid, High** (below). |

Use **autocomplete** for names so they match the bot.

---

## The big rules

1. **Only one elixir buff on your character at a time.** You can carry **many bottles** in inventory; they don’t stack as multiple buffs.
2. **Buff elixirs don’t time out in real life.** After **`/item`**, the buff **stays** until the bot **spends** it in the right activity (travel, combat, gather, loot, etc.). Another buff elixir is blocked while one is active (see in-bot messages).
3. **Hearty**, **Fairy Tonic**, and **Enduring** are **one-shot** on **`/item`** (no long buff). Most other elixirs set a **lasting buff** until spent. **Energizing** refills stamina **and** keeps a buff until spent.

---

## Pick an elixir for the situation

### Weather & hazards

| Bottle | Bring it when… |
| --- | --- |
| **Chilly** | Heat, **fire**, hot places, fire-themed threats |
| **Spicy** | **Cold**, **ice**, frost, ice-themed threats |
| **Electro** | **Lightning**, shock, storm-style danger |
| **Bright** | **Blight** weather / infection-style conditions |
| **Sticky** | **Water** danger + a little extra on harvest/reward-style outcomes (**plus boost**) |

**Remember:** **Chilly** = fire/heat · **Sticky** = water · **Bright** = blight — three different bottles.

### Combat & travel

| Bottle | Bring it when… |
| --- | --- |
| **Mighty** | You need to hit harder (**attack**) |
| **Tough** | You need to take less damage (**defense**) |
| **Sneaky** | You want **stealth** or better **flee** (gather, loot, travel encounters) |
| **Hasty** | You want **shorter travel** (speed — travel often **spends** the buff) |

### Hearts & stamina

| Bottle | What it does |
| --- | --- |
| **Hearty** | **+1 / +2 / +3** temporary hearts by tier, right away. **Fairy** mix-in on the bottle adds more hearts when you use **`/item`**. |
| **Fairy Tonic** | Heals **missing** HP up to your tier cap (about **¼ / ½ / full missing** of max hearts). **Fairy / Mock Fairy** extras add bonus heal. |
| **Enduring** | **+5 / +7 / +9** stamina chunks to **max and current** — one-shot on **`/item`**. |
| **Energizing** | **+5 / +7 / +9** stamina **refill** on **`/item`**, **plus** an **active buff** until the bot uses it in stamina-related play (gather, loot, crafting hooks, etc.). |

**Stamina chunks:** counts are whole numbers; **5 chunks ≈ 1 wheel** if you think in wheels.

---

## Tiers: Basic, Mid, High

Bottles are **Basic / Mid / High**. Autocomplete shows which stack you’re using, e.g. `Mighty Elixir [Mid]` or `Chilly Elixir [High|m2]` ( **`m`** = Fairy mix-in hearts — pick the line that matches **your** stack). If you care about potency, **pick the exact line** for the stack you want; otherwise the bot may use **lower tiers first**.

**Stronger tier → stronger effect.** The bot stores numbers **rounded** for consistency: **whole numbers** for hearts and stamina chunks; resist and combat-style stats to the nearest **0.25** (e.g. **×1.75**).

### Fixed numbers (Hearty, Energizing, Enduring, Fairy Tonic)

| Elixir | Basic | Mid | High |
| --- | ---: | ---: | ---: |
| **Hearty** | +1 heart | +2 | +3 |
| **Energizing** | +5 chunks refill | +7 | +9 |
| **Enduring** | +5 chunks to max & current | +7 | +9 |
| **Fairy Tonic** | ~¼ max-hearts heal cap | ~½ | up to all missing |

**Fairy Tonic** heal uses **max hearts** at **`/item`**; actual heal = **`min(budget, missing hearts)`**, never above max.

### Other buff elixirs (Chilly, Spicy, Electro, Bright, Sticky, Mighty, Tough, Sneaky, Hasty)

**Mid** multiplies the Basic stat by **×1.15**, **High** by **×1.3**, then rounds to **0.25**. **Sticky** boosts **water resistance** and **plus boost**. **Sneaky** boosts **stealth** and **flee**.

---

## Commands (short)

| Command | Role |
| --- | --- |
| **`/item`** | Use elixirs and items (here: elixirs). |
| **`/crafting brew`** | **Witches** make elixirs through the mixer. |
| **`/crafting recipe`** | Other jobs’ fixed recipes — **not** the main elixir pipeline for Witches. |

**Crafting** uses the channel the bot expects (usually **village town hall**).

---

## Brewing (`/crafting brew`)

1. **Witch** runs **`/crafting brew`** → **character** + **elixir** line.
2. Menus: **critter** (matches **effect family**) → **monster part** (often **Chuchu Jelly**; some lines need a colored jelly / element part — the bot tells you).
3. Optional **extras** (parts or same-family critters, up to the limit). **Fairy / Mock Fairy** can add **bonus hearts** on **`/item`** and count strong for **tier** math.
4. **Cancel** before finish → no ingredients or stamina spent. **Finish** → spend ingredients + stamina, get the bottle with a **tier** (**mixer score** on the result).

**Chuchu Jelly** (and similar) go in the mixer; **Chuchu Egg** is for other systems (e.g. hatch / pet).

### Why ingredients matter

- **Critters** have an **effect family** (chilly, mighty, …) — must match the elixir you’re brewing.
- **Parts** have an **element** — many brews allow **neutral**; some need **fire** (e.g. Chilly), **ice** (Spicy), **electric** (Electro), **undead-adjacent** (Bright), etc.

### Rarity & tier from the mixer

Each ingredient has **rarity** (often **1–10**). The mixer blends **critter + part + extras** into a **score** → **Basic (1–3)**, **Mid (4–6)**, or **High (7–10)**. **Rarer** ingredients and **on-theme extras** (same family critter, matching part on threaded recipes) help. **Fairy / Mock Fairy** count as at least **rarity 5** for that math. **Mix-in** hearts from Fairies are tracked **separately** on the inventory row.

---

## Quick reminders

- **One** active buff elixir at a time; many bottles in inventory is fine.
- **Quantity 1** per **`/item`** for elixirs.
- **Witches:** elixirs from **`/crafting brew`**.
- **Chilly** = heat/fire · **Sticky** = water · **Bright** = blight.
- Only items the mixer **menus** offer as labeled critters/parts will work; ask staff about odd items.

