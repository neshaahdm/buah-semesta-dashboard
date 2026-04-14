import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useTheme } from "@/lib/theme";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Images,
  Layers,
  Clock,
  Upload,
  RefreshCw,
  Moon,
  Sun,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  CheckCircle2,
  ImageIcon,
  Leaf,
  RotateCcw,
  ThumbsUp,
  ThumbsDown,
  FileText,
  Eye,
  Pencil,
  Save,
  X,
  Download,
} from "lucide-react";
import { useState } from "react";
import type { SourceImage, Carousel } from "@shared/schema";
import { API_BASE } from "@/lib/api-base";

// Brand logo SVG
function BuahSemestaLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      className={className}
      aria-label="Buah Semesta logo"
    >
      <circle cx="20" cy="22" r="14" fill="currentColor" opacity="0.15" />
      <circle cx="20" cy="22" r="10" fill="currentColor" opacity="0.25" />
      <path
        d="M20 4c3 5 1 12 0 14-1-2-3-9 0-14z"
        fill="currentColor"
        opacity="0.7"
      />
      <path
        d="M20 4c-1 3 2 8 5 10"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
      />
      <circle cx="20" cy="22" r="6" fill="currentColor" />
      <ellipse cx="18" cy="20.5" rx="1.5" ry="2" fill="white" opacity="0.3" />
    </svg>
  );
}

// Stats types
interface Stats {
  totalImages: number;
  carouselsCreated: number;
  pending: number;
  pendingReview: number;
  approved: number;
  uploaded: number;
}

const statusConfig: Record<string, { label: string; color: string }> = {
  draft: { label: "Draft", color: "bg-slate-500/15 text-slate-600 dark:text-slate-400" },
  pending_review: { label: "Needs Review", color: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  approved: { label: "Approved", color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  rejected: { label: "Revise", color: "bg-red-500/15 text-red-600 dark:text-red-400" },
  uploaded: { label: "Uploaded", color: "bg-blue-500/15 text-blue-700 dark:text-blue-400" },
};

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
  loading,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  accent?: string;
  loading?: boolean;
}) {
  return (
    <Card className="border border-card-border">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              {label}
            </p>
            {loading ? (
              <Skeleton className="h-7 w-16 mt-1" />
            ) : (
              <p className="text-xl font-bold mt-1 tabular-nums">
                {value}
              </p>
            )}
          </div>
          <div
            className={`w-9 h-9 rounded-lg flex items-center justify-center ${accent || "bg-primary/10 text-primary"}`}
          >
            <Icon className="w-4 h-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ImageThumbnail({
  image,
  onClick,
  carousel,
}: {
  image: SourceImage;
  onClick: () => void;
  carousel?: Carousel;
}) {
  const [imgError, setImgError] = useState(false);
  const thumbUrl =
    image.thumbnailUrl ||
    `https://drive.google.com/thumbnail?id=${image.driveFileId}&sz=w400`;

  const statusInfo = carousel ? statusConfig[carousel.status || "draft"] : null;

  return (
    <button
      onClick={onClick}
      className="group relative rounded-lg overflow-hidden border border-card-border bg-card hover:border-primary/40 transition-all duration-200 text-left"
      data-testid={`source-image-${image.id}`}
    >
      <div className="aspect-square bg-muted relative overflow-hidden">
        {!imgError ? (
          <img
            src={thumbUrl}
            alt={image.fileName}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={() => setImgError(true)}
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            <ImageIcon className="w-8 h-8" />
          </div>
        )}
        {carousel && statusInfo && (
          <div className="absolute top-2 right-2">
            <Badge
              variant="secondary"
              className={`text-[10px] px-1.5 py-0.5 border-0 ${statusInfo.color}`}
            >
              {carousel.status === "pending_review" ? (
                <Eye className="w-3 h-3 mr-1" />
              ) : carousel.status === "approved" || carousel.status === "uploaded" ? (
                <CheckCircle2 className="w-3 h-3 mr-1" />
              ) : (
                <Layers className="w-3 h-3 mr-1" />
              )}
              {statusInfo.label}
            </Badge>
          </div>
        )}
        {image.status === "pending" && !carousel && (
          <div className="absolute top-2 right-2">
            <Badge
              variant="secondary"
              className="text-[10px] px-1.5 py-0.5 bg-amber-500/15 text-amber-700 dark:text-amber-400 border-0"
            >
              Pending
            </Badge>
          </div>
        )}
      </div>
      <div className="p-2">
        <p className="text-xs font-medium truncate">
          {image.fileName.replace(".jpg", "").replace(/-/g, " ")}
        </p>
      </div>
    </button>
  );
}

function CarouselPreview({
  carousel,
  sourceImage,
  onClick,
}: {
  carousel: Carousel;
  sourceImage?: SourceImage;
  onClick: () => void;
}) {
  const slides: string[] = JSON.parse(carousel.slidePaths || "[]");
  const [current, setCurrent] = useState(0);
  const statusInfo = statusConfig[carousel.status || "draft"];

  return (
    <Card
      className="border border-card-border overflow-hidden cursor-pointer hover:border-primary/40 transition-all"
      data-testid={`carousel-${carousel.id}`}
      onClick={onClick}
    >
      <div className="aspect-square bg-muted relative overflow-hidden">
        {slides.length > 0 ? (
          <>
            <img
              src={`${API_BASE}/api/slides/${slides[current]}`}
              alt={`Slide ${current + 1}`}
              className="w-full h-full object-cover"
            />
            {slides.length > 1 && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setCurrent((c) => Math.max(0, c - 1));
                  }}
                  className="absolute left-1 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60 transition-colors"
                  disabled={current === 0}
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setCurrent((c) => Math.min(slides.length - 1, c + 1));
                  }}
                  className="absolute right-1 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60 transition-colors"
                  disabled={current === slides.length - 1}
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                  {slides.map((_, i) => (
                    <div
                      key={i}
                      className={`w-1.5 h-1.5 rounded-full transition-colors ${
                        i === current ? "bg-white" : "bg-white/40"
                      }`}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            <Layers className="w-8 h-8" />
          </div>
        )}
        {statusInfo && (
          <div className="absolute top-2 right-2">
            <Badge
              variant="secondary"
              className={`text-[10px] px-1.5 py-0.5 border-0 ${statusInfo.color}`}
            >
              {statusInfo.label}
            </Badge>
          </div>
        )}
      </div>
      <CardContent className="p-3">
        <p className="text-xs font-medium truncate">
          {sourceImage?.fileName.replace(".jpg", "").replace(/-/g, " ") ||
            `Image #${carousel.sourceImageId}`}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[10px] text-muted-foreground">
            {carousel.slideCount} slide{carousel.slideCount !== 1 ? "s" : ""}
          </span>
          {carousel.caption && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
              <FileText className="w-2.5 h-2.5" /> Caption
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Content Review Panel
function ContentReviewPanel({
  carousel,
  sourceImage,
  onClose,
}: {
  carousel: Carousel;
  sourceImage?: SourceImage;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [editingCaption, setEditingCaption] = useState(false);
  const [captionText, setCaptionText] = useState(carousel.caption || "");
  const [hashtagsText, setHashtagsText] = useState(carousel.hashtags || "");
  const [slideViewIndex, setSlideViewIndex] = useState(0);
  const [showRevisionBox, setShowRevisionBox] = useState(false);
  const [revisionNote, setRevisionNote] = useState("");
  const slides: string[] = JSON.parse(carousel.slidePaths || "[]");

  const statusInfo = statusConfig[carousel.status || "draft"];

  // Save caption mutation
  const saveCaptionMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", `/api/carousels/${carousel.id}/caption`, {
        caption: captionText,
        hashtags: hashtagsText,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/carousels"] });
      setEditingCaption(false);
      toast({ title: "Caption saved" });
    },
  });

  // Regenerate caption mutation
  const regenMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        `/api/carousels/${carousel.id}/regenerate-caption`
      );
      return res.json();
    },
    onSuccess: (data: Carousel) => {
      setCaptionText(data.caption || "");
      setHashtagsText(data.hashtags || "");
      queryClient.invalidateQueries({ queryKey: ["/api/carousels"] });
      toast({ title: "New caption generated" });
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to regenerate",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        `/api/carousels/${carousel.id}/approve`
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/carousels"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: "Content approved", description: "Carousel is ready for upload." });
    },
  });

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: async (note: string) => {
      const res = await apiRequest(
        "POST",
        `/api/carousels/${carousel.id}/reject`,
        { note: note || "Perlu revisi" }
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/carousels"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      setShowRevisionBox(false);
      setRevisionNote("");
      toast({ title: "Dikirim untuk revisi" });
    },
  });

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        `/api/carousels/${carousel.id}/upload`
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/carousels"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: "Uploaded to Drive" });
    },
  });

  const canApprove =
    carousel.status === "pending_review" || carousel.status === "rejected";
  const canUpload = carousel.status === "approved";

  const handleDownload = () => {
    const url = `${API_BASE}/api/carousels/${carousel.id}/download`;
    const a = document.createElement("a");
    a.href = url;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast({ title: "Download started", description: "Your ZIP file is downloading." });
  };

  return (
    <div className="space-y-4">
      {/* Slide Viewer */}
      <div className="aspect-[4/3] rounded-lg overflow-hidden bg-muted relative">
        {slides.length > 0 ? (
          <>
            <img
              src={`${API_BASE}/api/slides/${slides[slideViewIndex]}`}
              alt={`Slide ${slideViewIndex + 1}`}
              className="w-full h-full object-contain bg-black/5 dark:bg-white/5"
            />
            {slides.length > 1 && (
              <>
                <button
                  onClick={() =>
                    setSlideViewIndex((c) => Math.max(0, c - 1))
                  }
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70"
                  disabled={slideViewIndex === 0}
                  data-testid="review-prev"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() =>
                    setSlideViewIndex((c) =>
                      Math.min(slides.length - 1, c + 1)
                    )
                  }
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70"
                  disabled={slideViewIndex === slides.length - 1}
                  data-testid="review-next"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                  {slides.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setSlideViewIndex(i)}
                      className={`w-2 h-2 rounded-full transition-colors ${
                        i === slideViewIndex ? "bg-white" : "bg-white/40"
                      }`}
                    />
                  ))}
                </div>
                <div className="absolute top-3 right-3 bg-black/50 text-white text-[10px] px-2 py-0.5 rounded-full">
                  {slideViewIndex + 1} / {slides.length}
                </div>
              </>
            )}
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            <Layers className="w-8 h-8" />
          </div>
        )}
      </div>

      {/* Status & Meta */}
      <div className="flex items-center gap-2">
        {statusInfo && (
          <Badge
            variant="secondary"
            className={`text-xs border-0 ${statusInfo.color}`}
          >
            {statusInfo.label}
          </Badge>
        )}
        <span className="text-xs text-muted-foreground">
          {carousel.slideCount} slide{carousel.slideCount !== 1 ? "s" : ""}
        </span>
        {carousel.approvedAt && (
          <span className="text-xs text-muted-foreground">
            Approved {new Date(carousel.approvedAt).toLocaleDateString()}
          </span>
        )}
      </div>

      {/* Caption Section */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Caption
          </h3>
          <div className="flex items-center gap-1">
            {!editingCaption ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs px-2"
                  onClick={() => setEditingCaption(true)}
                  data-testid="edit-caption-btn"
                >
                  <Pencil className="w-3 h-3 mr-1" />
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs px-2"
                  onClick={() => regenMutation.mutate()}
                  disabled={regenMutation.isPending}
                  data-testid="regen-caption-btn"
                >
                  <RotateCcw
                    className={`w-3 h-3 mr-1 ${regenMutation.isPending ? "animate-spin" : ""}`}
                  />
                  {regenMutation.isPending ? "Generating..." : "Regenerate"}
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs px-2"
                  onClick={() => saveCaptionMutation.mutate()}
                  disabled={saveCaptionMutation.isPending}
                  data-testid="save-caption-btn"
                >
                  <Save className="w-3 h-3 mr-1" />
                  Save
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs px-2"
                  onClick={() => {
                    setEditingCaption(false);
                    setCaptionText(carousel.caption || "");
                    setHashtagsText(carousel.hashtags || "");
                  }}
                >
                  <X className="w-3 h-3 mr-1" />
                  Cancel
                </Button>
              </>
            )}
          </div>
        </div>

        {editingCaption ? (
          <div className="space-y-2">
            <Textarea
              value={captionText}
              onChange={(e) => setCaptionText(e.target.value)}
              placeholder="Write your Instagram caption..."
              className="min-h-[80px] text-sm resize-none"
              data-testid="caption-textarea"
            />
            <Textarea
              value={hashtagsText}
              onChange={(e) => setHashtagsText(e.target.value)}
              placeholder="#hashtags..."
              className="min-h-[48px] text-sm resize-none text-muted-foreground"
              data-testid="hashtags-textarea"
            />
          </div>
        ) : (
          <div className="bg-muted/50 rounded-lg p-3 space-y-2">
            <p className="text-sm leading-relaxed whitespace-pre-wrap">
              {carousel.caption || "No caption yet"}
            </p>
            {carousel.hashtags && (
              <p className="text-xs text-primary/70 leading-relaxed">
                {carousel.hashtags}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Review note if rejected */}
      {carousel.status === "rejected" && carousel.reviewNote && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
          <p className="text-xs font-medium text-red-700 dark:text-red-400">
            Revision note:
          </p>
          <p className="text-sm text-red-600 dark:text-red-300 mt-0.5">
            {carousel.reviewNote}
          </p>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 pt-1 flex-wrap">
        {/* Download button — always visible once slides exist */}
        {slides.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs px-3"
            onClick={handleDownload}
            data-testid="download-btn"
          >
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Download ZIP
          </Button>
        )}
        {canApprove && (
          <>
            <Button
              onClick={() => approveMutation.mutate()}
              disabled={approveMutation.isPending}
              className="flex-1"
              data-testid="approve-btn"
              style={{
                backgroundColor: "hsl(153, 51%, 30%)",
                borderColor: "hsl(153, 51%, 25%)",
              }}
            >
              <ThumbsUp className="w-4 h-4 mr-2" />
              {approveMutation.isPending ? "Approving..." : "Approve"}
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowRevisionBox((v) => !v)}
              disabled={rejectMutation.isPending}
              className="flex-1"
              data-testid="reject-btn"
            >
              <ThumbsDown className="w-4 h-4 mr-2" />
              Request Revision
            </Button>
          </>
        )}

        {/* Revision note box — appears below buttons when Request Revision clicked */}
        {showRevisionBox && (
          <div className="w-full space-y-2 pt-1" data-testid="revision-box">
            <p className="text-xs font-medium text-muted-foreground">
              Tulis catatan revisi (opsional):
            </p>
            <Textarea
              value={revisionNote}
              onChange={(e) => setRevisionNote(e.target.value)}
              placeholder="Contoh: ganti wording benefit jadi lebih singkat, atau ubah foto slide 2..."
              className="min-h-[80px] text-sm resize-none"
              data-testid="revision-note-textarea"
              autoFocus
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1 h-8 text-xs"
                onClick={() => rejectMutation.mutate(revisionNote)}
                disabled={rejectMutation.isPending}
                data-testid="submit-revision-btn"
                style={{ backgroundColor: "hsl(0,70%,50%)", borderColor: "hsl(0,70%,45%)" }}
              >
                {rejectMutation.isPending ? "Mengirim..." : "Kirim Catatan Revisi"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs px-3"
                onClick={() => { setShowRevisionBox(false); setRevisionNote(""); }}
              >
                Batal
              </Button>
            </div>
          </div>
        )}
        {canUpload && (
          <Button
            onClick={() => uploadMutation.mutate()}
            disabled={uploadMutation.isPending}
            className="flex-1"
            data-testid="upload-btn"
            style={{
              backgroundColor: "hsl(217, 60%, 50%)",
              borderColor: "hsl(217, 60%, 45%)",
            }}
          >
            <Upload className="w-4 h-4 mr-2" />
            {uploadMutation.isPending ? "Uploading..." : "Upload to Drive"}
          </Button>
        )}
        {carousel.status === "uploaded" && (
          <Button variant="outline" disabled className="flex-1">
            <CheckCircle2 className="w-4 h-4 mr-2" />
            Uploaded to Drive
          </Button>
        )}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { theme, toggle } = useTheme();
  const { toast } = useToast();
  const [selectedImage, setSelectedImage] = useState<SourceImage | null>(null);
  const [reviewCarousel, setReviewCarousel] = useState<Carousel | null>(null);

  // Queries
  const statsQuery = useQuery<Stats>({
    queryKey: ["/api/stats"],
  });

  const imagesQuery = useQuery<SourceImage[]>({
    queryKey: ["/api/source-images"],
  });

  const carouselsQuery = useQuery<Carousel[]>({
    queryKey: ["/api/carousels"],
  });

  // Mutations
  const scanMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/scan");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/source-images"] });
      toast({
        title: "Scan complete",
        description: "Drive folder scanned successfully.",
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Scan failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const generateMutation = useMutation({
    mutationFn: async (sourceImageId: number) => {
      const res = await apiRequest("POST", "/api/carousels/generate", {
        sourceImageId,
      });
      return res.json();
    },
    onSuccess: (data: Carousel) => {
      queryClient.invalidateQueries({ queryKey: ["/api/carousels"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/source-images"] });
      setSelectedImage(null);
      setReviewCarousel(data);
      toast({
        title: "Carousel generated",
        description: "Review the caption before approving.",
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Generation failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const stats = statsQuery.data;
  const images = imagesQuery.data || [];
  const allCarousels = carouselsQuery.data || [];

  // Map carousels by sourceImageId
  const carouselMap = new Map<number, Carousel>();
  allCarousels.forEach((c) => carouselMap.set(c.sourceImageId, c));

  // Image map for carousel display
  const imageMap = new Map<number, SourceImage>();
  images.forEach((img) => imageMap.set(img.id, img));

  // Filter carousels needing review
  const needsReview = allCarousels.filter(
    (c) => c.status === "pending_review" || c.status === "rejected"
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <BuahSemestaLogo className="w-8 h-8 text-primary" />
            <div>
              <h1
                className="text-sm font-bold tracking-tight leading-none"
                style={{ fontFamily: "'Cabinet Grotesk', sans-serif" }}
              >
                Buah Semesta
              </h1>
              <p className="text-[10px] text-muted-foreground leading-none mt-0.5">
                Carousel Dashboard
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {needsReview.length > 0 && (
              <Badge
                variant="secondary"
                className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-0 text-xs cursor-pointer"
                onClick={() => {
                  const first = needsReview[0];
                  setReviewCarousel(first);
                }}
                data-testid="review-badge"
              >
                <Eye className="w-3 h-3 mr-1" />
                {needsReview.length} to review
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => scanMutation.mutate()}
              disabled={scanMutation.isPending}
              data-testid="scan-button"
              className="h-8 text-xs"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 mr-1.5 ${scanMutation.isPending ? "animate-spin" : ""}`}
              />
              Scan Now
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={toggle}
              data-testid="theme-toggle"
              className="h-8 w-8 p-0"
            >
              {theme === "dark" ? (
                <Sun className="w-4 h-4" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Stats Row */}
        <div
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3"
          data-testid="stats-row"
        >
          <StatCard
            label="Total Images"
            value={stats?.totalImages ?? 0}
            icon={Images}
            accent="bg-primary/10 text-primary"
            loading={statsQuery.isLoading}
          />
          <StatCard
            label="Carousels"
            value={stats?.carouselsCreated ?? 0}
            icon={Layers}
            accent="bg-blue-500/10 text-blue-600 dark:text-blue-400"
            loading={statsQuery.isLoading}
          />
          <StatCard
            label="Pending"
            value={stats?.pending ?? 0}
            icon={Clock}
            accent="bg-slate-500/10 text-slate-600 dark:text-slate-400"
            loading={statsQuery.isLoading}
          />
          <StatCard
            label="Needs Review"
            value={stats?.pendingReview ?? 0}
            icon={Eye}
            accent="bg-amber-500/10 text-amber-600 dark:text-amber-400"
            loading={statsQuery.isLoading}
          />
          <StatCard
            label="Approved"
            value={stats?.approved ?? 0}
            icon={ThumbsUp}
            accent="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            loading={statsQuery.isLoading}
          />
          <StatCard
            label="Uploaded"
            value={stats?.uploaded ?? 0}
            icon={Upload}
            accent="bg-blue-500/10 text-blue-600 dark:text-blue-400"
            loading={statsQuery.isLoading}
          />
        </div>

        {/* Two-column layout */}
        <div className="grid lg:grid-cols-5 gap-6">
          {/* Source Images — left (3 cols) */}
          <section className="lg:col-span-3 space-y-3">
            <div className="flex items-center justify-between">
              <h2
                className="text-sm font-bold"
                style={{ fontFamily: "'Cabinet Grotesk', sans-serif" }}
              >
                Source Images
              </h2>
              <span className="text-xs text-muted-foreground">
                {images.length} images
              </span>
            </div>
            {imagesQuery.isLoading ? (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="aspect-square rounded-lg" />
                    <Skeleton className="h-3 w-3/4" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {images.map((img) => (
                  <ImageThumbnail
                    key={img.id}
                    image={img}
                    carousel={carouselMap.get(img.id)}
                    onClick={() => {
                      const existingCarousel = carouselMap.get(img.id);
                      if (existingCarousel) {
                        setReviewCarousel(existingCarousel);
                      } else {
                        setSelectedImage(img);
                      }
                    }}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Generated Carousels — right (2 cols) */}
          <section className="lg:col-span-2 space-y-3">
            <div className="flex items-center justify-between">
              <h2
                className="text-sm font-bold"
                style={{ fontFamily: "'Cabinet Grotesk', sans-serif" }}
              >
                Generated Carousels
              </h2>
              <span className="text-xs text-muted-foreground">
                {allCarousels.length} carousel
                {allCarousels.length !== 1 ? "s" : ""}
              </span>
            </div>
            {carouselsQuery.isLoading ? (
              <div className="grid grid-cols-2 gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="aspect-square rounded-lg" />
                    <Skeleton className="h-3 w-3/4" />
                  </div>
                ))}
              </div>
            ) : allCarousels.length === 0 ? (
              <Card className="border border-dashed border-card-border">
                <CardContent className="py-12 flex flex-col items-center text-center">
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                    <Sparkles className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium">No carousels yet</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Click a source image to generate one
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {allCarousels.map((c) => (
                  <CarouselPreview
                    key={c.id}
                    carousel={c}
                    sourceImage={imageMap.get(c.sourceImageId)}
                    onClick={() => setReviewCarousel(c)}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </main>

      {/* Generate Dialog (for images without a carousel) */}
      <Dialog
        open={!!selectedImage}
        onOpenChange={(open) => {
          if (!open) setSelectedImage(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle
              className="text-base"
              style={{ fontFamily: "'Cabinet Grotesk', sans-serif" }}
            >
              {selectedImage?.fileName
                .replace(".jpg", "")
                .replace(/-/g, " ")}
            </DialogTitle>
          </DialogHeader>

          {selectedImage && (
            <div className="space-y-4">
              <div className="aspect-square rounded-lg overflow-hidden bg-muted">
                <ImageWithFallback image={selectedImage} />
              </div>
              <p className="text-xs text-muted-foreground text-center">
                This will generate carousel slides and an AI-written caption for your review.
              </p>
              <Button
                onClick={() => generateMutation.mutate(selectedImage.id)}
                disabled={generateMutation.isPending}
                className="w-full"
                data-testid="generate-carousel-button"
                style={{
                  backgroundColor: "hsl(20, 80%, 50%)",
                  borderColor: "hsl(20, 80%, 45%)",
                }}
              >
                <Sparkles className="w-4 h-4 mr-2" />
                {generateMutation.isPending
                  ? "Generating carousel & caption..."
                  : "Generate Carousel"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Content Review Dialog */}
      <Dialog
        open={!!reviewCarousel}
        onOpenChange={(open) => {
          if (!open) {
            setReviewCarousel(null);
            // Refetch to get latest data
            queryClient.invalidateQueries({ queryKey: ["/api/carousels"] });
          }
        }}
      >
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle
              className="text-base flex items-center gap-2"
              style={{ fontFamily: "'Cabinet Grotesk', sans-serif" }}
            >
              <FileText className="w-4 h-4" />
              Content Review
            </DialogTitle>
          </DialogHeader>
          {reviewCarousel && (
            <ContentReviewPanel
              carousel={reviewCarousel}
              sourceImage={imageMap.get(reviewCarousel.sourceImageId)}
              onClose={() => setReviewCarousel(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ImageWithFallback({ image }: { image: SourceImage }) {
  const [error, setError] = useState(false);
  const thumbUrl =
    image.thumbnailUrl ||
    `https://drive.google.com/thumbnail?id=${image.driveFileId}&sz=w1080`;

  if (error) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
        <Leaf className="w-12 h-12" />
        <p className="text-sm font-medium">
          {image.fileName.replace(".jpg", "").replace(/-/g, " ")}
        </p>
      </div>
    );
  }

  return (
    <img
      src={thumbUrl}
      alt={image.fileName}
      className="w-full h-full object-cover"
      onError={() => setError(true)}
    />
  );
}
