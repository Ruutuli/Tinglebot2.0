// ============================================================================
// ------------------- Grotto Names -------------------
// Random names for grottos discovered during exploration (stored/identified by name)
// ============================================================================

const GROTTO_BASE_NAMES = [
  "Adenamimik", "Apogek", "Bamitok", "Chichim", "Domizuin", "Ekochiu", "En-oma", "Eshos", "Eutoum",
  "Ga-ahisas", "Ganos", "Gasas", "Gatakis", "Gatanisis", "Gemimik", "Gikaku", "Gutanbac",
  "Igashuk", "Igoshon", "Ihen-a", "Ijo-o", "Ikatak", "In-isa", "Irasak", "Ishodag", "Ishokin",
  "Isisim", "Iun-orok", "Jikais", "Jinodok", "Jiosin", "Jiotak", "Jirutagumac", "Jiukoum",
  "Jochi-ihiga", "Jochi-iu", "Jochisiu", "Jogou", "Jojon", "Joju-u-u", "Joku-u", "Joku-usin",
  "Joniu", "Jonsau", "Josiu", "Kadaunar", "Kahatanaum", "Kamatukis", "Kamizun", "Karahatag",
  "Kikakin", "Kimayat", "Kisinona", "Kitawak", "Kiuyoyou", "Kudanisar", "Kumamayn", "Kurakat",
  "Kyokugon", "Kyononis", "Makasura", "Makurukis", "Maoikes", "Marakuguc", "Marari-in",
  "Mayachideg", "Mayachin", "Mayahisik", "Mayak", "Mayam", "Mayamats", "Mayanas", "Mayaotaki",
  "Mayasiar", "Mayatat", "Mayaumekis", "Mayausiy", "Minetak", "Miryotanog", "Mogawak",
  "Mogisari", "Momosik", "Morok", "Moshapin", "Motsusis", "Musanokir", "Nachoyah", "Natak",
  "Ninjis", "Nouda", "O-ogim", "Orochium", "Oromuwak", "Oshozan-u", "Otak", "Otutsum",
  "Pupunke", "Rakakudaj", "Rakashog", "Rasitakiwak", "Rasiwak", "Ren-iz", "Riogok", "Rotsumamu",
  "Runakit", "Rutafu-um", "Sahirow", "Sakunbomar", "Sepapa", "Serutabomac", "Sibajitak",
  "Sifumim", "Sihajog", "Sikukuu", "Simosiwak", "Sinakawak", "Sinatanika", "Sisuran", "Sitsum",
  "Siwakama", "Siyamotsus", "Sonapan", "Soryotanog", "Suariwak", "Susub", "Susuyai",
  "Tadarok", "Tajikats", "Taki-Ihaban", "Taninoud", "Taunhiy", "Tauyosipun", "Tenbez", "Teniten",
  "Tenmaten", "Timawak", "Tokiy", "Tsutsu-um", "Tukarok", "Turakawak", "Turakmik",
  "Ukoojisi", "Ukouh", "Usazum", "Utojis", "Utsushok", "Wao-os", "Yamiyo", "Yansamin",
  "Yomizuk", "Zakusu", "Zanmik",
];

function getRandomGrottoName() {
  const base = GROTTO_BASE_NAMES[Math.floor(Math.random() * GROTTO_BASE_NAMES.length)];
  return `${base} Grotto`;
}

module.exports = {
  GROTTO_BASE_NAMES,
  getRandomGrottoName,
};
