# Elixirs — player guide

Quick reference for **`/item`** (drink) and **`/crafting brew`** (Witch mixer). Numbers match **`elixirModule.js`** (live bot).

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

### Reminder: current vs max (hearts and stamina)

For almost everything in play, **current** cannot go **above** **max**. If you’re **3/3** hearts, you normally **cannot** end up **5/3**; same idea for stamina (**current ≤ max**).

**Hearty** and **Enduring** are **special cases**. They **only** add to **current** — they **never** raise **max**. That’s why they can show numbers like **5/3** or **8/5** until you take damage or spend stamina down. **Fairy Tonic**, **Energizing** refills, and most other effects follow the usual cap (**current** stays at or below **max**).

---

## Pick an elixir for the situation

### Weather & hazards

| Bottle | Bring it when… |
| --- | --- |
| **Chilly** | Heat, **fire**, hot places, fire-themed threats |
| **Spicy** | **Cold**, **ice**, frost, ice-themed threats |
| **Electro** | **Lightning**, shock, storm-style danger |
| **Bright** | **Blight** weather / infection-style conditions |
| **Sticky** | **Water** resistance (water-type monsters & water-themed danger) + **Sticky bonus**: extra copies of the same item whenever you get items — **higher tier = better odds & higher cap**. *Cold/ice → **Spicy**, not Sticky.* |

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
| **Hearty** | **Basic ×1.2 / Mid ×1.4 / High ×1.7** of your **max hearts** — temporary **extra current** only (**max** unchanged; see **Reminder** above). **`m`** Fairy mix-in heals **up to max**; the **tier** bonus can go past max. |
| **Fairy Tonic** | Heals **missing** HP only (never above your real max). Heal **budget** by tier: **½ / ¾ / full max hearts** (floored whole hearts), then **`min(budget, missing)`**. **Fairy / Mock Fairy** extras add bonus heal. |
| **Enduring** | **Basic ×1.25 / Mid ×1.45 / High ×1.7** of your **max stamina (chunks)** — extra **current** chunks only (**max** unchanged; see **Reminder** above). Formula below; tuned for **~5** chunks. One-shot on **`/item`**. |
| **Energizing** | **+5 / +7 / +9** stamina chunks **refill** on **`/item`** by tier, **plus** an **active buff** until the bot uses it in stamina-related play (gather, loot, crafting hooks, etc.). |

**Stamina chunks:** whole numbers; **5 chunks ≈ 1 wheel** if you think in wheels.

---

## Tiers: Basic, Mid, High

Bottles are **Basic / Mid / High**. Autocomplete shows which stack you’re using, e.g. `Mighty Elixir [Mid]` or `Chilly Elixir [High|m2]` (**`m`** = Fairy **mix-in** hearts on that stack — pick the line that matches **your** inventory row). If you care about potency, **pick the exact line**; otherwise the bot may use **lower tiers first**.

**Stronger tier → stronger effect.** Whole numbers for hearts and stamina chunks; resist and combat-style buff stats use the nearest **0.25** (e.g. **×1.75**).

### Energizing (fixed chunk ladder)

| Tier | Stamina refill (chunks) |
| --- | ---: |
| Basic | +5 |
| Mid | +7 |
| High | +9 |

### Hearty & Enduring — **× max pool** (separate tier multipliers)

**Gain:** **`ceil(max × M) − max`** (whole hearts/chunks), at least **+1** if that difference would be **0**.

**Hearty** (`HEARTY_MAX_POOL_MULTIPLIERS` in code) — tuned so **~3 max hearts** gives about **+1 / +2 / +3** at Basic / Mid / High:

| Tier | **M** (hearts) |
| --- | ---: |
| Basic | 1.2 |
| Mid | 1.4 |
| High | 1.7 |

**Enduring** (`ENDURING_MAX_POOL_MULTIPLIERS`) — tuned so **~5 max stamina chunks** gives about **+2 / +3 / +4**:

| Tier | **M** (chunks) |
| --- | ---: |
| Basic | 1.25 |
| Mid | 1.45 |
| High | 1.7 |

- **Hearty / Enduring:** gain goes to **current** only; **max** never increases. These two elixirs are the usual way **current** can sit **above** **max** for a while (see **Reminder** at the top of this guide).

Other max pools still scale with the same formula; only these baselines were used for calibration.

### Fairy Tonic (heal budget by tier)

Heal **budget** (how much you *could* heal toward missing HP) is a **fraction of max hearts**, **floored** to whole hearts:

| Tier | Budget (of max hearts) |
| --- | ---: |
| Basic | ½ |
| Mid | ¾ |
| High | 1× (full max) |

**Actual heal** = **`min(budget, missing hearts)`** — you never overheal above max.

### Sticky Elixir — **plus** extra loot

**Sticky bonus:** whenever an action **gives you items**, you might also get **extra copies of that same item** (not a random second item). **Tier** sets the **per-step chance** and **max extras per action**: **Basic** up to **2**, **Mid** up to **4**, **High** up to **5** (see `STICKY_BONUS_REPEAT_CHANCE` / `STICKY_BONUS_MAX_EXTRAS_BY_LEVEL` in `elixirModule.js`). **Water resistance** is separate — for **cold / ice**, drink **Spicy**, not Sticky.

### Other buff elixirs (Chilly, Spicy, Electro, Bright, Mighty, Tough, Sneaky, Hasty)

**Mid** multiplies the Basic stat by **×1.15**, **High** by **×1.3**, then rounds to **0.25**. **Sneaky** boosts **stealth** and **flee**.

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

---

## See also

- Mixer design detail: **`docs/elixir-mixing/README.md`**
