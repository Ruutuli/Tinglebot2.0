### Commands

#### Create Mod Character
```
/modcharacter create oracle
/modcharacter create dragon  
/modcharacter create sage
```

Each subcommand requires:
- Character name
- Age
- Height (in cm)
- Pronouns
- Race
- Village (Rudania, Vhintl, Inariko)
- Type (Oracle/Dragon/Sage specific types)
- Job (can be any regular job OR the mod title: Oracle, Sage, or Dragon)
- Inventory Google Sheets link
- App link

**Examples:**
```
# Oracle with Oracle as job
/modcharacter create oracle name:"Aemu" age:25 height:170 pronouns:"she/her" race:"Hylian" village:"Rudania" oracle_type:"Power" job:"Oracle" inventory_link:"..." app_link:"..."

# Sage with regular job
/modcharacter create sage name:"Ginger" age:30 height:165 pronouns:"they/them" race:"Korok" village:"Vhintl" sage_type:"Forest" job:"Herbalist" inventory_link:"..." app_link:"..."

# Dragon with Dragon as job
/modcharacter create dragon name:"Sanskar" age:1000 height:200 pronouns:"he/him" race:"Dragon" village:"Inariko" dragon_type:"Wisdom" job:"Dragon" inventory_link:"..." app_link:"..." 
```

# Tinglebot 2.0

A Discord bot for managing character interactions, raids, and village activities in a Zelda-themed roleplay environment.

## Features

### Combat System
- **Regular Combat**: Equipment provides percentage-based bonuses to attack and defense
- **Raid Combat**: Equipment **always** provides guaranteed benefits during raids
  - Weapons: Always add `attackStat × 2.5` to combat rolls
  - Armor/Shields: Always add `defenseStat × 1.1` to combat rolls
  - This makes equipment valuable and impactful in raid scenarios while maintaining challenge

### Equipment System
- Characters can equip weapons, armor (head, chest, legs), and shields
- Equipment provides modifierHearts values that affect combat performance
- In raids, equipment guarantees its benefits instead of using percentage chances

### Raid System
- Multi-participant boss battles against high-tier monsters
- Equipment always helps during raids (unlike regular combat)
- Participants deal damage based on their equipment and rolls
- Loot distribution based on damage dealt

## Installation

1. Clone the repository
2. Install dependencies: `npm install`
3. Set up environment variables
4. Run the bot: `npm start`

## Configuration

See `config/` directory for configuration files.

## Contributing

Please follow the established code style and add appropriate error handling for all new features. 