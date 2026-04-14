import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export interface CaptionResult {
  caption: string;
  hashtags: string;
}

/**
 * Generate an Instagram caption for a fruit carousel.
 * @param fileName  - source image file name (used to hint fruit type if fruitName not provided)
 * @param slideCount - number of slides
 * @param fruitName  - identified fruit name from the carousel content
 * @param revisionNote - optional user revision note to guide regeneration
 */
export async function generateCaption(
  fileName: string,
  slideCount: number,
  fruitName?: string,
  revisionNote?: string
): Promise<CaptionResult> {
  // Derive best fruit name hint
  const fruitHint = fruitName && fruitName !== "Buah Segar"
    ? fruitName
    : fileName.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ").replace(/\b\w/g, c => c.toUpperCase());

  const revisionSection = revisionNote
    ? `\n\nCatatan revisi dari editor: "${revisionNote}" — pastikan caption baru mempertimbangkan masukan ini.`
    : "";

  const message = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 512,
    messages: [
      {
        role: "user",
        content: `Kamu adalah copywriter media sosial untuk "Buah Semesta", brand buah segar Indonesia. Tulis caption Instagram menarik untuk carousel post tentang **${fruitHint}**:

Slide 1: Foto ${fruitHint} + manfaat kesehatan
Slide 2: Tips cara memilih ${fruitHint} yang bagus  
Slide 3: Tips cara menyimpan ${fruitHint} agar tahan lama

Panduan penulisan:
- Bahasa Indonesia, nada hangat dan bersahabat seperti ngobrol ke teman
- 2–3 kalimat, singkat & engaging, sebut nama buahnya
- Sertakan ajakan bertindak (CTA) seperti order, DM, atau swipe
- 1–2 emoji yang natural
- Jangan tulis hashtag di dalam caption${revisionSection}

Kemudian berikan 8–10 hashtag yang relevan termasuk nama buahnya di baris terpisah.

Format jawaban PERSIS seperti ini:
CAPTION: [caption di sini]
HASHTAGS: [hashtag di sini]`,
      },
    ],
  });

  const text =
    message.content[0].type === "text" ? message.content[0].text : "";

  const captionMatch = text.match(/CAPTION:\s*(.+?)(?=\nHASHTAGS:|\n\n|$)/s);
  const hashtagsMatch = text.match(/HASHTAGS:\s*(.+?)$/s);

  const caption = captionMatch
    ? captionMatch[1].trim()
    : `${fruitHint} segar pilihan langsung dari kebun terbaik 🍊 Swipe untuk lihat manfaat, cara pilih, dan cara simpannya! DM kami untuk order sekarang.`;

  const hashtags = hashtagsMatch
    ? hashtagsMatch[1].trim()
    : `#BuahSemesta #${fruitHint.replace(/\s+/g,"")} #BuahSegar #FreshFruits #BuahTropis #HidupSehat #MakanSehat #BuahLokal #JualBuah #FruitLovers`;

  return { caption, hashtags };
}
