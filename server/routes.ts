import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { generateCarousel, regenerateSlidesWithName } from "./carousel";
import { generateCaption } from "./caption";
import { listSourceImages, uploadCarouselToOutput, hasDriveCredentials } from "./drive";
import express from "express";
import path from "path";
import fs from "fs";
import archiver from "archiver";

// Use persistent volume path on Railway, local fallback in dev
const CAROUSEL_OUTPUT = process.env.DB_PATH
  ? path.join(path.dirname(process.env.DB_PATH), "carousels")
  : path.resolve(process.cwd(), "output/carousels");

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // ─── Auth ──────────────────────────────────────────────────────────
  const APP_PASSWORD = process.env.APP_PASSWORD || "Semestacontent2026";

  app.post("/api/login", (req, res) => {
    const { password } = req.body;
    if (password === APP_PASSWORD) {
      res.json({ success: true, token: Buffer.from(APP_PASSWORD).toString("base64") });
    } else {
      res.status(401).json({ success: false, error: "Password salah" });
    }
  });

  app.get("/api/verify", (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ valid: false });
    const token = authHeader.replace("Bearer ", "");
    try {
      const decoded = Buffer.from(token, "base64").toString();
      if (decoded === APP_PASSWORD) {
        return res.json({ valid: true });
      }
    } catch {}
    return res.status(401).json({ valid: false });
  });

  // Serve carousel slide images statically
  app.use(
    "/api/slides",
    express.static(CAROUSEL_OUTPUT)
  );

  // GET /api/source-images — List all source images from DB
  app.get("/api/source-images", (_req, res) => {
    try {
      const images = storage.getAllSourceImages();
      res.json(images);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/carousels — List all generated carousels
  app.get("/api/carousels", (_req, res) => {
    try {
      const allCarousels = storage.getAllCarousels();
      res.json(allCarousels);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/carousels/generate — Generate carousel from a source image
  app.post("/api/carousels/generate", async (req, res) => {
    try {
      const { sourceImageId } = req.body;
      if (!sourceImageId) {
        res.status(400).json({ error: "sourceImageId is required" });
        return;
      }

      const sourceImage = storage.getSourceImage(sourceImageId);
      if (!sourceImage) {
        res.status(404).json({ error: "Source image not found" });
        return;
      }

      // Check if carousel already exists
      const existing = storage.getCarouselBySourceImage(sourceImageId);
      if (existing) {
        res.json(existing);
        return;
      }

      // Generate the carousel slides
      const result = await generateCarousel(
        sourceImage.driveFileId,
        sourceImage.id,
        sourceImage.fileName
      );

      // Generate AI caption — read fruit name from saved content.json if available
      let caption = "";
      let hashtags = "";
      try {
        let fruitName: string | undefined;
        try {
          const contentFile = path.join(result.outputDir, "content.json");
          if (fs.existsSync(contentFile)) {
            fruitName = JSON.parse(fs.readFileSync(contentFile, "utf8")).fruitName;
          }
        } catch {}
        const captionResult = await generateCaption(sourceImage.fileName, result.slideCount, fruitName);
        caption = captionResult.caption;
        hashtags = captionResult.hashtags;
        // Save fruitName for later editing
        if (fruitName) {
          (req as any)._fruitName = fruitName;
        }
      } catch (captionErr) {
        console.error("Caption generation failed, using defaults:", captionErr);
        caption = "";
        hashtags = "";
      }

      // Save to DB with draft status (pending content review)
      const carousel = storage.createCarousel({
        sourceImageId: sourceImage.id,
        slideCount: result.slideCount,
        slidePaths: JSON.stringify(result.slidePaths),
        caption,
        hashtags,
        status: "pending_review",
        fruitName: (req as any)._fruitName || "",
        reviewNote: "",
        createdAt: new Date().toISOString(),
        approvedAt: "",
      });

      // Update source image status
      storage.updateSourceImageStatus(sourceImage.id, "processed");

      res.json(carousel);
    } catch (err: any) {
      console.error("Carousel generation error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // PATCH /api/carousels/:id/fruit-name — Update fruit name AND re-render slides + caption
  app.patch("/api/carousels/:id/fruit-name", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const carousel = storage.getCarousel(id);
      if (!carousel) {
        res.status(404).json({ error: "Carousel not found" });
        return;
      }
      const { fruitName } = req.body;
      if (!fruitName || typeof fruitName !== "string") {
        res.status(400).json({ error: "fruitName is required" });
        return;
      }
      const cleanName = fruitName.trim();

      // Save to DB
      storage.updateCarouselFruitName(id, cleanName);

      // Re-render slides with the corrected fruit name
      const slides: string[] = JSON.parse(carousel.slidePaths || "[]");
      if (slides.length > 0) {
        const imageId = parseInt(slides[0].split("/")[0], 10);
        await regenerateSlidesWithName(imageId, cleanName);
      }

      // Regenerate caption with corrected fruit name
      const sourceImage = storage.getSourceImage(carousel.sourceImageId);
      const fileName = sourceImage?.fileName || "";
      try {
        const captionResult = await generateCaption(fileName, carousel.slideCount || 3, cleanName);
        storage.updateCarouselCaption(id, captionResult.caption, captionResult.hashtags);
      } catch (capErr) {
        console.error("Caption regen failed:", capErr);
      }

      const updated = storage.getCarousel(id);
      res.json(updated);
    } catch (err: any) {
      console.error("fruit-name update error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // PUT /api/carousels/:id/caption — Update caption and hashtags
  app.put("/api/carousels/:id/caption", (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const carousel = storage.getCarousel(id);
      if (!carousel) {
        res.status(404).json({ error: "Carousel not found" });
        return;
      }

      const { caption, hashtags } = req.body;
      storage.updateCarouselCaption(
        id,
        caption ?? carousel.caption,
        hashtags ?? carousel.hashtags
      );

      const updated = storage.getCarousel(id);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/carousels/:id/regenerate-caption — Regenerate AI caption
  app.post("/api/carousels/:id/regenerate-caption", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const carousel = storage.getCarousel(id);
      if (!carousel) {
        res.status(404).json({ error: "Carousel not found" });
        return;
      }

      const sourceImage = storage.getSourceImage(carousel.sourceImageId);
      const fileName = sourceImage?.fileName || "fruit-image.jpg";

      // Try to read stored fruit name from content.json
      let fruitName: string | undefined;
      try {
        const slides: string[] = JSON.parse(carousel.slidePaths || "[]");
        if (slides.length > 0) {
          const dirName = slides[0].split("/")[0];
          const contentFile = path.join(CAROUSEL_OUTPUT, dirName, "content.json");
          if (fs.existsSync(contentFile)) {
            fruitName = JSON.parse(fs.readFileSync(contentFile, "utf8")).fruitName;
          }
        }
      } catch {}

      // Pass revision note if provided
      const { revisionNote } = req.body;

      const captionResult = await generateCaption(fileName, carousel.slideCount || 1, fruitName, revisionNote);
      storage.updateCarouselCaption(id, captionResult.caption, captionResult.hashtags);

      const updated = storage.getCarousel(id);
      res.json(updated);
    } catch (err: any) {
      console.error("Regenerate caption error:", err);
      res.status(500).json({ error: err.message || "Failed to regenerate caption" });
    }
  });

  // POST /api/carousels/:id/approve — Approve content + auto-upload to Drive
  app.post("/api/carousels/:id/approve", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const carousel = storage.getCarousel(id);
      if (!carousel) {
        res.status(404).json({ error: "Carousel not found" });
        return;
      }

      storage.approveCarousel(id);

      // Save caption file alongside slides
      const slides: string[] = JSON.parse(carousel.slidePaths || "[]");
      try {
        if (slides.length > 0) {
          const dirName = slides[0].split("/")[0];
          const captionDir = path.join(CAROUSEL_OUTPUT, dirName);
          const captionContent = `${carousel.caption}\n\n${carousel.hashtags}`;
          fs.writeFileSync(path.join(captionDir, "caption.txt"), captionContent, "utf8");
        }
      } catch (e) {
        console.error("Failed to save caption file:", e);
      }

      // Auto-upload to Drive immediately after approval
      if (hasDriveCredentials() && slides.length > 0) {
        try {
          // Debug: check if slide files actually exist on disk
          for (const sp of slides) {
            const fullPath = path.join(CAROUSEL_OUTPUT, sp);
            const exists = fs.existsSync(fullPath);
            console.log(`[upload] Checking slide: ${fullPath} — exists: ${exists}`);
          }
          const sourceImage = storage.getSourceImage(carousel.sourceImageId);
          const fruitName = sourceImage?.fileName?.replace(/\.[^.]+$/, "") || `carousel-${id}`;
          const driveUrl = await uploadCarouselToOutput(fruitName, slides);
          storage.updateCarouselStatus(id, "uploaded");
          const uploaded = storage.getCarousel(id);
          return res.json({ ...uploaded, driveUrl });
        } catch (uploadErr: any) {
          console.error("Auto-upload to Drive failed:", uploadErr?.message || uploadErr);
          const updated = storage.getCarousel(id);
          return res.json({ ...updated, uploadError: uploadErr?.message || "Upload failed" });
        }
      }

      const updated = storage.getCarousel(id);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/carousels/:id — Delete a carousel so it can be regenerated
  app.delete("/api/carousels/:id", (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const carousel = storage.getCarousel(id);
      if (!carousel) {
        res.status(404).json({ error: "Carousel not found" });
        return;
      }
      // Also reset source image status back to pending
      storage.updateSourceImageStatus(carousel.sourceImageId, "pending");
      storage.deleteCarousel(id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/carousels/:id/reject — Reject content (send back to review)
  app.post("/api/carousels/:id/reject", (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const carousel = storage.getCarousel(id);
      if (!carousel) {
        res.status(404).json({ error: "Carousel not found" });
        return;
      }

      const { note } = req.body;
      storage.updateCarouselReview(id, "rejected", note || "");

      const updated = storage.getCarousel(id);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/carousels/:id/upload — Upload approved carousel to Drive
  app.post("/api/carousels/:id/upload", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const carousel = storage.getCarousel(id);
      if (!carousel) {
        res.status(404).json({ error: "Carousel not found" });
        return;
      }
      if (carousel.status !== "approved") {
        res.status(400).json({ error: "Carousel must be approved before uploading" });
        return;
      }

      const slides: string[] = JSON.parse(carousel.slidePaths || "[]");

      // Get fruit name from source image
      const sourceImage = storage.getSourceImage(carousel.sourceImageId);
      const fruitName = sourceImage?.fileName?.replace(/\.[^.]+$/, "") || `carousel-${id}`;

      if (hasDriveCredentials() && slides.length > 0) {
        // Upload to Google Drive
        const driveUrl = await uploadCarouselToOutput(fruitName, slides);
        storage.updateCarouselStatus(id, "uploaded");
        res.json({ ...carousel, status: "uploaded", driveUrl });
      } else {
        // No Drive credentials — just mark as uploaded
        storage.updateCarouselStatus(id, "uploaded");
        res.json({ ...carousel, status: "uploaded", driveUrl: null });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/carousels/:id/download — Download carousel as ZIP
  app.get("/api/carousels/:id/download", (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const carousel = storage.getCarousel(id);
      if (!carousel) {
        res.status(404).json({ error: "Carousel not found" });
        return;
      }

      const slides: string[] = JSON.parse(carousel.slidePaths || "[]");
      if (slides.length === 0) {
        res.status(404).json({ error: "No slides found" });
        return;
      }

      const dirName = slides[0].split("/")[0];
      const carouselDir = path.join(CAROUSEL_OUTPUT, dirName);

      // Get source image name for the zip filename
      const sourceImage = storage.getSourceImage(carousel.sourceImageId);
      const baseName = sourceImage?.fileName
        ? sourceImage.fileName.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_")
        : `carousel_${id}`;

      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="${baseName}_carousel.zip"`);

      const archive = archiver("zip", { zlib: { level: 9 } });
      archive.on("error", (err: Error) => {
        console.error("Archive error:", err);
        if (!res.headersSent) res.status(500).json({ error: err.message });
      });
      archive.pipe(res);

      // Add all slides
      for (const slidePath of slides) {
        const slideFile = path.join(CAROUSEL_OUTPUT, slidePath);
        if (fs.existsSync(slideFile)) {
          archive.file(slideFile, { name: path.basename(slideFile) });
        }
      }

      // Add caption.txt if it exists
      const captionFile = path.join(carouselDir, "caption.txt");
      if (fs.existsSync(captionFile)) {
        archive.file(captionFile, { name: "caption.txt" });
      } else if (carousel.caption) {
        // Write caption on the fly if file doesn't exist yet
        const captionContent = `${carousel.caption}\n\n${carousel.hashtags}`;
        archive.append(captionContent, { name: "caption.txt" });
      }

      archive.finalize();
    } catch (err: any) {
      console.error("Download error:", err);
      if (!res.headersSent) res.status(500).json({ error: err.message });
    }
  });

  // GET /api/stats — Dashboard statistics
  app.get("/api/stats", (_req, res) => {
    try {
      const stats = storage.getStats();
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/seed — Bulk-insert source images (used to populate fresh DB)
  app.post("/api/seed", (req, res) => {
    try {
      const images = req.body as Array<{
        drive_file_id: string;
        file_name: string;
        mime_type?: string;
        thumbnail_url?: string;
        status?: string;
        created_at?: string;
      }>;
      if (!Array.isArray(images)) {
        return res.status(400).json({ error: "Expected array of images" });
      }
      let inserted = 0;
      let skipped = 0;
      for (const img of images) {
        try {
          storage.createSourceImage({
            driveFileId: img.drive_file_id,
            fileName: img.file_name,
            mimeType: img.mime_type || "image/jpeg",
            thumbnailUrl: img.thumbnail_url || null,
            status: img.status || "pending",
            createdAt: img.created_at || new Date().toISOString(),
          });
          inserted++;
        } catch (e: any) {
          if (e.message?.includes("UNIQUE")) skipped++;
          else throw e;
        }
      }
      res.json({ message: "Seed complete", inserted, skipped });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/scan — Scan Google Drive for new images, remove deleted ones
  app.post("/api/scan", async (_req, res) => {
    try {
      if (!hasDriveCredentials()) {
        const stats = storage.getStats();
        return res.json({ message: "Scan complete (no Drive credentials)", totalImages: stats.totalImages, newImages: 0 });
      }

      const driveFiles = await listSourceImages();
      const driveFileIds = new Set(driveFiles.map((f) => f.id));

      // 1. Remove DB records for files deleted from Drive
      const allDbImages = storage.getAllSourceImages();
      let removedImages = 0;
      for (const dbImage of allDbImages) {
        if (!driveFileIds.has(dbImage.driveFileId)) {
          storage.deleteSourceImage(dbImage.id);
          removedImages++;
        }
      }

      // 2. Add new files from Drive not yet in DB
      let newImages = 0;
      for (const file of driveFiles) {
        const existing = storage.getSourceImageByDriveId(file.id);
        if (!existing) {
          const thumbnailUrl = `https://drive.google.com/thumbnail?id=${file.id}&sz=w400`;
          storage.createSourceImage({
            driveFileId: file.id,
            fileName: file.name,
            mimeType: file.mimeType,
            thumbnailUrl,
            status: "pending",
            createdAt: new Date().toISOString(),
          });
          newImages++;
        }
      }

      const stats = storage.getStats();
      res.json({
        message: "Scan complete",
        totalImages: stats.totalImages,
        newImages,
        removedImages,
        driveFilesFound: driveFiles.length,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return httpServer;
}
