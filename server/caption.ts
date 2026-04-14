import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export interface CaptionResult {
  caption: string;
  hashtags: string;
}

export async function generateCaption(
  fileName: string,
  slideCount: number
): Promise<CaptionResult> {
  const message = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 512,
    messages: [
      {
        role: "user",
        content: `Kamu adalah copywriter media sosial untuk "Buah Semesta", brand buah segar Indonesia. Tulis caption Instagram menarik untuk carousel post 3 slide berikut:

Slide 1: Foto buah segar + manfaat kesehatan
Slide 2: Tips cara memilih buah yang bagus  
Slide 3: Tips cara menyimpan buah agar tahan lama

Panduan penulisan:
- Bahasa Indonesia, nada hangat dan bersahabat
- 2–3 kalimat, singkat & engaging
- Sertakan ajakan bertindak (CTA) seperti order, DM, atau swipe
- 1–2 emoji yang natural
- Jangan tulis hashtag di dalam caption

Kemudian berikan 8–10 hashtag yang relevan di baris terpisah.

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
    : `Buah segar pilihan langsung dari kebun terbaik 🍊 Swipe untuk lihat manfaat, cara pilih, dan cara simpannya! DM kami untuk order sekarang.`;

  const hashtags = hashtagsMatch
    ? hashtagsMatch[1].trim()
    : "#BuahSemesta #BuahSegar #FreshFruits #BuahTropis #HidupSehat #MakanSehat #BuahLokal #JualBuah #FruitLovers #HealthyLifestyle";

  return { caption, hashtags };
}
