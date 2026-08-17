"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X } from "lucide-react";
import { VideoUploader } from "./VideoUploader";
import type { JWTPayload } from "@/types";

export function GlobalUploadFab() {
  const [showUploader, setShowUploader] = useState(false);

  const meQ = useQuery<{ user: JWTPayload | null }>({
    queryKey: ["me"],
    queryFn: () => fetch("/api/auth/me").then(r => r.json()),
  });


  const usersQ = useQuery<{ users: { userId: string; name: string }[] }>({
    queryKey: ["admin-users-fab"],
    queryFn: () => fetch("/api/users").then(r => {
      if (!r.ok) return { users: [] };
      return r.json();
    }),
    enabled: meQ.data?.user?.role === "eduskill_manager" || meQ.data?.user?.role === "eduskill_admin",
  });

  const role = meQ.data?.user?.role;
  const isManagerOrAdmin = role === "eduskill_manager" || role === "eduskill_admin";

  if (!isManagerOrAdmin) return null;

  const facultyList = (usersQ.data?.users ?? []).map(u => ({ userId: u.userId, name: u.name }));

  return (
    <>
      {/* FAB button */}
      <motion.button
        onClick={() => setShowUploader(true)}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="fixed bottom-24 right-5 md:bottom-6 md:right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-fg text-bg shadow-lg shadow-black/20 transition-colors hover:bg-fg/90"
        style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }}
      >
        <AnimatePresence mode="wait">
          {showUploader ? (
            <motion.span key="x" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }}>
              <X className="h-6 w-6" />
            </motion.span>
          ) : (
            <motion.span key="plus" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }}>
              <Plus className="h-6 w-6" />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>

      {/* Reuse VideoUploader in headless mode (auto-open) */}
      {showUploader && (
        <InlineUploader
          facultyList={facultyList}
          onClose={() => setShowUploader(false)}
        />
      )}
    </>
  );
}

function InlineUploader({
  facultyList,
  onClose,
}: {
  facultyList: { userId: string; name: string }[];
  onClose: () => void;
}) {
  return (
    <VideoUploader
      onSuccess={onClose}
      managerMode
      facultyList={facultyList}
      autoOpen
      onClose={onClose}
    />
  );
}
