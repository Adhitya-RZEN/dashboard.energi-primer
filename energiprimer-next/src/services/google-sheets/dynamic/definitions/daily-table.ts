export const DAILY_HEADER_ALIASES = {
  date: ["TANGGAL", "TGL", "DATE"],
  unit: ["UNIT", "UNIT 1", "UNIT 2", "UNIT 3"],
  biomass: [
    "BIOMASSA",
    "BIOMASS",
    "SAWDUST",
    "WOODCHIP",
    "LRUK",
    "SRF",
    "BONGGOL",
  ],
  coal: ["BATUBARA", "BATU BARA", "COAL"],
  solar: ["SOLAR", "HSD"],
  total: ["TOTAL", "TOTAL (TON)", "TOTAL TON"],
  stock: ["STOK", "STOCK", "STOK AKHIR", "STOCK AKHIR"],
  hop: ["HOP", "HARI OPERASI"],
  ton: ["TON", "TONASE"],
  liter: ["LITER", "LITRE"],
} as const;

export const DAILY_TABLE_HINTS = [
  "TANGGAL",
  "TGL",
  "BATUBARA",
  "BIOMASSA",
  "SOLAR",
  "HSD",
  "TOTAL",
  "STOK",
  "HOP",
] as const;
