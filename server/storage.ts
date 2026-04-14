import {
  type SourceImage,
  type InsertSourceImage,
  type Carousel,
  type InsertCarousel,
  sourceImages,
  carousels,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, sql } from "drizzle-orm";

const sqlite = new Database("data.db");
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite);

export interface IStorage {
  // Source images
  getAllSourceImages(): SourceImage[];
  getSourceImage(id: number): SourceImage | undefined;
  getSourceImageByDriveId(driveFileId: string): SourceImage | undefined;
  createSourceImage(image: InsertSourceImage): SourceImage;
  updateSourceImageStatus(id: number, status: string): void;

  // Carousels
  getAllCarousels(): Carousel[];
  getCarousel(id: number): Carousel | undefined;
  getCarouselBySourceImage(sourceImageId: number): Carousel | undefined;
  createCarousel(carousel: InsertCarousel): Carousel;
  updateCarouselStatus(id: number, status: string): void;
  updateCarouselCaption(id: number, caption: string, hashtags: string): void;
  updateCarouselReview(id: number, status: string, note: string): void;
  approveCarousel(id: number): void;

  // Stats
  getStats(): {
    totalImages: number;
    carouselsCreated: number;
    pending: number;
    pendingReview: number;
    approved: number;
    uploaded: number;
  };
}

export class DatabaseStorage implements IStorage {
  getAllSourceImages(): SourceImage[] {
    return db.select().from(sourceImages).all();
  }

  getSourceImage(id: number): SourceImage | undefined {
    return db.select().from(sourceImages).where(eq(sourceImages.id, id)).get();
  }

  getSourceImageByDriveId(driveFileId: string): SourceImage | undefined {
    return db
      .select()
      .from(sourceImages)
      .where(eq(sourceImages.driveFileId, driveFileId))
      .get();
  }

  createSourceImage(image: InsertSourceImage): SourceImage {
    return db.insert(sourceImages).values(image).returning().get();
  }

  updateSourceImageStatus(id: number, status: string): void {
    db.update(sourceImages)
      .set({ status })
      .where(eq(sourceImages.id, id))
      .run();
  }

  getAllCarousels(): Carousel[] {
    return db.select().from(carousels).all();
  }

  getCarousel(id: number): Carousel | undefined {
    return db.select().from(carousels).where(eq(carousels.id, id)).get();
  }

  getCarouselBySourceImage(sourceImageId: number): Carousel | undefined {
    return db
      .select()
      .from(carousels)
      .where(eq(carousels.sourceImageId, sourceImageId))
      .get();
  }

  createCarousel(carousel: InsertCarousel): Carousel {
    return db.insert(carousels).values(carousel).returning().get();
  }

  updateCarouselStatus(id: number, status: string): void {
    db.update(carousels)
      .set({ status })
      .where(eq(carousels.id, id))
      .run();
  }

  updateCarouselCaption(id: number, caption: string, hashtags: string): void {
    db.update(carousels)
      .set({ caption, hashtags })
      .where(eq(carousels.id, id))
      .run();
  }

  updateCarouselReview(id: number, status: string, note: string): void {
    db.update(carousels)
      .set({ status, reviewNote: note })
      .where(eq(carousels.id, id))
      .run();
  }

  approveCarousel(id: number): void {
    db.update(carousels)
      .set({ status: "approved", approvedAt: new Date().toISOString() })
      .where(eq(carousels.id, id))
      .run();
  }

  getStats() {
    const totalImages =
      db
        .select({ count: sql<number>`count(*)` })
        .from(sourceImages)
        .get()?.count ?? 0;

    const carouselsCreated =
      db
        .select({ count: sql<number>`count(*)` })
        .from(carousels)
        .get()?.count ?? 0;

    const pending =
      db
        .select({ count: sql<number>`count(*)` })
        .from(sourceImages)
        .where(eq(sourceImages.status, "pending"))
        .get()?.count ?? 0;

    const pendingReview =
      db
        .select({ count: sql<number>`count(*)` })
        .from(carousels)
        .where(eq(carousels.status, "pending_review"))
        .get()?.count ?? 0;

    const approved =
      db
        .select({ count: sql<number>`count(*)` })
        .from(carousels)
        .where(eq(carousels.status, "approved"))
        .get()?.count ?? 0;

    const uploaded =
      db
        .select({ count: sql<number>`count(*)` })
        .from(carousels)
        .where(eq(carousels.status, "uploaded"))
        .get()?.count ?? 0;

    return { totalImages, carouselsCreated, pending, pendingReview, approved, uploaded };
  }
}

export const storage = new DatabaseStorage();
