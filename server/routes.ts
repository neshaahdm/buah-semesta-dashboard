import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { generateCarousel } from "./carousel";
import { generateCaption } from "./caption";
import express from "express";
import path from "path";
import fs from "fs";
import archiver from "archiver";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Serve carousel slide images statically
  app.use(
    "/api/slides",
    express.static("./output/carousels")
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

      // Generate AI caption
      let caption = "";
      let hashtags = "";
      try {
        const captionResult = await generateCaption(sourceImage.fileName, result.slideCount);
        caption = captionResult.caption;
        hashtags = captionResult.hashtags;
      } catch (captionErr) {
        console.error("Caption generation failed, using defaults:", captionErr);
        caption = `Fresh from Buah Semesta 🍉🥭 Check out our premium selection!`;
        hashtags = "#BuahSemesta #FreshFruits #HealthyLiving #TropicalFruits #FruitLovers";
      }

      // Save to DB with draft status (pending content review)
      const carousel = storage.createCarousel({
        sourceImageId: sourceImage.id,
        slideCount: result.slideCount,
        slidePaths: JSON.stringify(result.slidePaths),
        caption,
        hashtags,
        status: "pending_review",
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

      const captionResult = await generateCaption(fileName, carousel.slideCount || 1);
      storage.updateCarouselCaption(id, captionResult.caption, captionResult.hashtags);

      const updated = storage.getCarousel(id);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/carousels/:id/approve — Approve content
  app.post("/api/carousels/:id/approve", (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const carousel = storage.getCarousel(id);
      if (!carousel) {
        res.status(404).json({ error: "Carousel not found" });
        return;
      }

      storage.approveCarousel(id);
      const updated = storage.getCarousel(id);

      // Save caption file alongside slides
      try {
        const slides: string[] = JSON.parse(carousel.slidePaths || "[]");
        if (slides.length > 0) {
          const dirName = slides[0].split("/")[0];
          const captionDir = path.join(
            "./output/carousels",
            dirName
          );
          const captionContent = `${updated!.caption}\n\n${updated!.hashtags}`;
          fs.writeFileSync(path.join(captionDir, "caption.txt"), captionContent, "utf8");
        }
      } catch (e) {
        console.error("Failed to save caption file:", e);
      }

      res.json(updated);
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
  app.post("/api/carousels/:id/upload", (req, res) => {
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

      storage.updateCarouselStatus(id, "uploaded");
      res.json({ ...carousel, status: "uploaded" });
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
      const carouselDir = path.join(
        "./output/carousels",
        dirName
      );

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
        const slideFile = path.join(
          "./output/carousels",
          slidePath
        );
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

  // POST /api/scan — Trigger manual scan
  app.post("/api/scan", (_req, res) => {
    try {
      const stats = storage.getStats();
      res.json({
        message: "Scan complete",
        totalImages: stats.totalImages,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return httpServer;
}
