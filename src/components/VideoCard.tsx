"use client";
import { motion } from "framer-motion";
import { Play } from "lucide-react";
import type { Video, GradiAnalysis, ManagerRating } from "@/types";
import { ScoreRing } from "./ScoreRing";
import { StatusChip } from "./StatusChip";
import { relativeTime } from "@/lib/utils";
import { SafeThumbnail } from "./SafeThumbnail";

interface VideoCardProps {
  video: Video & { 
    analysis?: GradiAnalysis | null;
    managerRating?: ManagerRating | null;
  };
  onClick: () => void;
  index?: number;
}

export function VideoCard({ video, onClick, index = 0 }: VideoCardProps) {
  return (
    <motion.button
      onClick={onClick}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: Math.min(index * 0.04, 0.3) }}
      whileHover={{ y: -4 }}
      className="group glass relative overflow-hidden rounded-xl text-left transition-colors hover:border-fg/15"
    >
      <div className="relative aspect-video overflow-hidden bg-bg-elev">
        <SafeThumbnail
          src={video.thumbnailUrl}
          alt={video.title}
          className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
          iconSize={32}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-bg-card via-transparent to-transparent" />
        <div className="absolute top-3 left-3">
          <StatusChip status={video.status} />
        </div>
        {video.managerRating?.total ? (
          <div className="absolute -bottom-3 right-3">
            <div className="rounded-full bg-bg-card border border-border p-1">
              <ScoreRing
                score={video.managerRating.total}
                max={25}
                size={56}
                stroke={4}
                showLabel
              />
            </div>
          </div>
        ) : null}
      </div>

      <div className="p-4 pt-5">
        <div className="flex items-center gap-2 mb-2">
          <span className="rounded-full border border-border bg-bg-elev/60 px-2 py-0.5 text-[10px] uppercase tracking-wider text-fg-muted">
            {video.subject}
          </span>
          <span className="text-[11px] text-fg-dim">
            {relativeTime(video.uploadedAt)}
          </span>
        </div>
        <h3 className="line-clamp-2 text-sm font-medium leading-snug text-fg mb-2">
          {video.title}
        </h3>
        {/* Video stats */}
        <div className="flex items-center gap-3 text-[10px] text-fg-muted">
          <div className="flex items-center gap-1">
            <span className="font-mono">{video.views ?? 0}</span>
            <span>views</span>
          </div>
          <span className="text-fg-dim">·</span>
          <div className="flex items-center gap-1">
            <span className="font-mono">{video.likes ?? 0}</span>
            <span>likes</span>
          </div>
          {video.duration && (
            <>
              <span className="text-fg-dim">·</span>
              <span className="font-mono">{video.duration}</span>
            </>
          )}
          {video.managerRating?.managerName && (
            <>
              <span className="text-fg-dim">·</span>
              <span className="text-emerald-400 font-medium truncate max-w-[120px]" title={`Rated by ${video.managerRating.managerName}`}>
                by {video.managerRating.managerName}
              </span>
            </>
          )}
        </div>
      </div>
    </motion.button>
  );
}
