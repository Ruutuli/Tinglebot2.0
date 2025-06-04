// Define all roles with categories and attributes
const roles = {
    Villages: [
      { name: 'Rudania Resident', color: '#d7342a' },
      { name: 'Rudania Visiting', color: '#d7342a' },
      { name: 'Inariko Resident', color: '#277ecd' },
      { name: 'Inariko Visiting', color: '#277ecd' },
      { name: 'Vhintl Resident', color: '#25c059' },
      { name: 'Vhintl Visiting', color: '#25c059' },
    ],
  
    Races: [
      { name: 'Race: Gerudo', color: '#5c5c5c' },
      { name: 'Race: Goron', color: '#5c5c5c' },
      { name: 'Race: Hylian', color: '#5c5c5c' },
      { name: 'Race: Keaton', color: '#5c5c5c' },
      { name: 'Race: Korok/Kokiri', color: '#5c5c5c' },
      { name: 'Race: Mixed', color: '#5c5c5c' },
      { name: 'Race: Mogma', color: '#5c5c5c' },
      { name: 'Race: Rito', color: '#5c5c5c' },
      { name: 'Race: Sheikah', color: '#5c5c5c' },
      { name: 'Race: Twili', color: '#5c5c5c' },
      { name: 'Race: Zora', color: '#5c5c5c' },
    ],
  
    Jobs: [
      { name: 'Job: Fisherman', color: '#5e626e' },
      { name: 'Job: Researcher', color: '#5e626e' },
      { name: 'Job: Scholar', color: '#5e626e' },
      { name: 'Job: Teacher', color: '#5e626e' },
      { name: 'Job: Rancher', color: '#5e626e' },
      { name: 'Job: Blacksmith', color: '#5e626e' },
      { name: 'Job: Miner', color: '#5e626e' },
      { name: 'Job: Entertainer', color: '#5e626e' },
      { name: 'Job: Beekeeper', color: '#5e626e' },
      { name: 'Job: Fortune Teller', color: '#5e626e' },
      { name: 'Job: Mask Maker', color: '#5e626e' },
      { name: 'Job: Weaver', color: '#5e626e' },
      { name: 'Job: Forager', color: '#5e626e' },
      { name: 'Job: Craftsman', color: '#5e626e' },
      { name: 'Job: Healer', color: '#5e626e' },
      { name: 'Job: Adventurer', color: '#5e626e' },
      { name: 'Job: Artist', color: '#5e626e' },
      { name: 'Job: Bandit', color: '#5e626e' },
      { name: 'Job: Cook', color: '#5e626e' },
      { name: 'Job: Courier', color: '#5e626e' },
      { name: 'Job: Farmer', color: '#5e626e' },
      { name: 'Job: Graveskeeper', color: '#5e626e' },
      { name: 'Job: Guard', color: '#5e626e' },
    ],
  
    JobPerks: [
      { name: 'Job Perk: GATHERING', color: '#8b96b8' },
      { name: 'Job Perk: CRAFTING', color: '#8b96b8' },
      { name: 'Job Perk: BOOST', color: '#8b96b8' },
      { name: 'Job Perk: LOOTING', color: '#8b96b8' },
      { name: 'Job Perk: STEALING', color: '#8b96b8' },
      { name: 'Job Perk: DELIVERING', color: '#8b96b8' },
      { name: 'Job Perk: HEALING', color: '#8b96b8' },
      { name: 'Job Perk: VENDING', color: '#8b96b8' },
      { name: 'Job Perk: NONE', color: '#8b96b8' },
    ],
  };
  
  // Utility to fetch all roles in a flat array
  const getAllRoles = () => {
    return Object.values(roles).flat();
  };
  
  // Export roles and utilities
  module.exports = {
    roles,
    getAllRoles,
  };
  