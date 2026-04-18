import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const sourceImages = sqliteTable("source_images", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  driveFileId: text("drive_file_id").notNull().unique(),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").default("image/jpeg"),
  thumbnailUrl: text("thumbnail_url"),
  status: text("status").default("pending"), // pending, processed, error
  createdAt: text("created_at").default(""),
});

export const carousels = sqliteTable("carousels", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sourceImageId: integer("source_image_id").notNull(),
  slideCount: integer("slide_count").default(0),
  slidePaths: text("slide_paths").default("[]"), // JSON array of file paths
  caption: text("caption").default(""),
  hashtags: text("hashtags").default(""),
  status: text("status").default("draft"), // draft, pending_review, approved, rejected, uploaded
  reviewNote: text("review_note").default(""),
  fruitName: text("fruit_name").default(""),
  createdAt: text("created_at").default(""),
  approvedAt: text("approved_at").default(""),
});

export const insertSourceImageSchema = createInsertSchema(sourceImages).omit({ id: true });
export const insertCarouselSchema = createInsertSchema(carousels).omit({ id: true });
export type SourceImage = typeof sourceImages.$inferSelect;
export type InsertSourceImage = z.infer<typeof insertSourceImageSchema>;
export type Carousel = typeof carousels.$inferSelect;
export type InsertCarousel = z.infer<typeof insertCarouselSchema>;
