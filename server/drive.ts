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

// Upload carousel slides (as a new folder) to the output folder
export async function uploadCarouselToOutput(
  fruitName: string,
  slidePaths: string[]
): Promise<string> {
  const auth = getAuth();
  const drive = google.drive({ version: "v3", auth });

  // Create a subfolder in Post semesta
  const folderMeta = await drive.files.create({
    requestBody: {
      name: `Carousel - ${fruitName} - ${new Date().toISOString().slice(0, 10)}`,
      mimeType: "application/vnd.google-apps.folder",
      parents: [OUTPUT_FOLDER_ID],
    },
    fields: "id",
  });
  const folderId = folderMeta.data.id!;

  // Upload each slide
  for (let i = 0; i < slidePaths.length; i++) {
    const slidePath = slidePaths[i];
    const fileName = `Slide ${i + 1} - ${fruitName}.png`;
    await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [folderId],
      },
      media: {
        mimeType: "image/png",
        body: fs.createReadStream(slidePath),
      },
      fields: "id",
    });
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
