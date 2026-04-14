import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { sourceImages } from "./shared/schema";

const sqlite = new Database("data.db");
sqlite.pragma("journal_mode = WAL");
const db = drizzle(sqlite);

// Seed 48 images from "Photo Buah Semesta" folder
// Using realistic UUID-style Drive file IDs
const fruits = [
  "Alpukat", "Anggur-Merah", "Anggur-Hijau", "Apel-Fuji", "Apel-Malang",
  "Belimbing", "Buah-Naga-Merah", "Buah-Naga-Putih", "Ceri", "Delima",
  "Durian-Montong", "Durian-Musang", "Jambu-Air", "Jambu-Biji", "Jeruk-Bali",
  "Jeruk-Mandarin", "Jeruk-Nipis", "Kiwi-Gold", "Kiwi-Green", "Kelapa-Muda",
  "Kelengkeng", "Leci", "Mangga-Harum-Manis", "Mangga-Gedong", "Manggis",
  "Markisa", "Melon-Hijau", "Melon-Orange", "Nanas-Madu", "Nangka",
  "Pir-Xiang-Lie", "Pir-Ya-Li", "Pisang-Cavendish", "Pisang-Raja",
  "Rambutan", "Salak-Pondoh", "Sawo", "Semangka-Merah", "Semangka-Kuning",
  "Sirsak", "Stroberi", "Pepaya-California", "Pepaya-Jingga", "Sukun",
  "Timun-Suri", "Tomat-Cherry", "Nanas-Queen", "Kurma-Medjool"
];

// Generate fake but plausible Drive file IDs
function generateDriveId(index: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
  let id = "";
  // Use a deterministic seed based on index
  let seed = index * 7919 + 1234567;
  for (let i = 0; i < 33; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    id += chars[seed % chars.length];
  }
  return id;
}

const seedData = fruits.map((name, index) => ({
  driveFileId: generateDriveId(index),
  fileName: `${name}.jpg`,
  mimeType: "image/jpeg",
  thumbnailUrl: `https://drive.google.com/thumbnail?id=${generateDriveId(index)}&sz=w400`,
  status: "pending",
  createdAt: "2025-12-11T08:00:00.000Z",
}));

// Check if already seeded
const existing = db.select().from(sourceImages).all();
if (existing.length === 0) {
  for (const img of seedData) {
    db.insert(sourceImages).values(img).run();
  }
  console.log(`Seeded ${seedData.length} source images`);
} else {
  console.log(`Already have ${existing.length} images, skipping seed`);
}
