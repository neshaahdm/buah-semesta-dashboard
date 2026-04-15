import { google } from "googleapis";
import fs from "fs";
import path from "path";
import https from "https";
import http from "http";

const SOURCE_FOLDER_ID = "1KtLxEuSo43iOjtgeSPx5ejUVCfkKZYv6";
const OUTPUT_FOLDER_ID  = "1yVOGCv-bFNtOysatbwUhznCvIeWistXC";

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT env var not set");
  const creds = JSON.parse(raw);
  return new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  thumbnailLink?: string;
  webContentLink?: string;
}

// List all image files in the source folder
export async function listSourceImages(): Promise<DriveFile[]> {
  const auth = getAuth();
  const drive = google.drive({ version: "v3", auth });

  const files: DriveFile[] = [];
  let pageToken: string | undefined;

  do {
    const res = await drive.files.list({
      q: `'${SOURCE_FOLDER_ID}' in parents and mimeType contains 'image/' and trashed = false`,
      fields: "nextPageToken, files(id, name, mimeType, thumbnailLink, webContentLink)",
      pageSize: 100,
      pageToken,
    });
    for (const f of res.data.files || []) {
      files.push({
        id: f.id!,
        name: f.name!,
        mimeType: f.mimeType!,
        thumbnailLink: f.thumbnailLink ?? undefined,
        webContentLink: f.webContentLink ?? undefined,
      });
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return files;
}

// Download a Drive file as a Buffer (for carousel generation)
export async function downloadDriveFile(fileId: string): Promise<Buffer> {
  const auth = getAuth();
  const drive = google.drive({ version: "v3", auth });
  const res = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" }
  );
  return Buffer.from(res.data as ArrayBuffer);
}

// The owner email to transfer files to after upload (service accounts have no quota on personal Drive)
const DRIVE_OWNER_EMAIL = "nesha.rea@gmail.com";

// Upload carousel slides (as a new folder) to the output folder
export async function uploadCarouselToOutput(
  fruitName: string,
  slidePaths: string[]
): Promise<string> {
  const auth = getAuth();
  const drive = google.drive({ version: "v3", auth });

  const OUTPUT_BASE = process.env.DB_PATH
    ? path.join(path.dirname(process.env.DB_PATH), "carousels")
    : path.resolve(process.cwd(), "output/carousels");

  // Create a subfolder in Post semesta
  const folderName = `Carousel - ${fruitName} - ${new Date().toISOString().slice(0, 10)}`;
  const folderMeta = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [OUTPUT_FOLDER_ID],
    },
    fields: "id",
    // Allow writing to folders owned by others (nesha.rea@gmail.com shared the folder with us)
    supportsAllDrives: true,
  } as any);
  const folderId = folderMeta.data.id!;

  const uploadedFileIds: string[] = [];

  // Upload each slide
  for (let i = 0; i < slidePaths.length; i++) {
    const slidePath = slidePaths[i];
    const fullPath = path.join(OUTPUT_BASE, slidePath);
    const ext = path.extname(slidePath).toLowerCase();
    const mimeType = ext === ".png" ? "image/png" : "image/jpeg";
    const fileName = `Slide ${i + 1} - ${fruitName}${ext}`;

    if (!fs.existsSync(fullPath)) {
      console.error(`[drive] Slide file not found: ${fullPath}`);
      continue;
    }

    const fileRes = await drive.files.create({
      requestBody: { name: fileName, parents: [folderId] },
      media: { mimeType, body: fs.createReadStream(fullPath) },
      fields: "id",
      supportsAllDrives: true,
    } as any);
    if (fileRes.data.id) uploadedFileIds.push(fileRes.data.id);
  }

  // Also upload caption.txt if it exists
  const captionFile = path.join(OUTPUT_BASE, slidePaths[0].split("/")[0], "caption.txt");
  if (fs.existsSync(captionFile)) {
    const capRes = await drive.files.create({
      requestBody: { name: "caption.txt", parents: [folderId] },
      media: { mimeType: "text/plain", body: fs.createReadStream(captionFile) },
      fields: "id",
      supportsAllDrives: true,
    } as any);
    if (capRes.data.id) uploadedFileIds.push(capRes.data.id);
  }

  // Transfer ownership of all uploaded files + the folder to the Drive owner
  // (Service accounts can't keep files — they have no quota on personal Drive)
  const allIds = [folderId, ...uploadedFileIds];
  for (const fileId of allIds) {
    try {
      await drive.permissions.create({
        fileId,
        requestBody: {
          role: "owner",
          type: "user",
          emailAddress: DRIVE_OWNER_EMAIL,
        },
        transferOwnership: true,
        supportsAllDrives: true,
      } as any);
    } catch (e: any) {
      // transferOwnership may fail on shared folders but files will still be accessible
      console.warn(`[drive] Could not transfer ownership of ${fileId}:`, e?.message);
    }
  }

  return `https://drive.google.com/drive/folders/${folderId}`;
}

// Get a direct download URL for a Drive file (for carousel generation)
export function getDriveImageUrl(fileId: string): string {
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}

// Check if Drive credentials are configured
export function hasDriveCredentials(): boolean {
  return !!process.env.GOOGLE_SERVICE_ACCOUNT;
}
