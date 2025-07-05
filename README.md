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