"use client";

import { useState, useEffect, useCallback } from "react";
import { Moon, Plus, Database, Trash2, Users, Info } from "lucide-react";
import JournalTimeline from "@/components/JournalTimeline";
import type { Dream } from "@/types/dream";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function JournalPage() {
  const router = useRouter();
  const [dreams, setDreams] = useState<Dream[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSeeding, setIsSeeding] = useState(false);

  const fetchDreams = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/dreams", { cache: "no-store" });
      if (response.ok) {
        const data = await response.json();
        setDreams(data);
      }
    } catch (error) {
      console.error("Fetch dreams error:", error);
      setDreams([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDreams();
  }, [fetchDreams]);

  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        fetchDreams();
      }
    };
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, [fetchDreams]);

  const handleSeedData = async () => {
    setIsSeeding(true);
    setIsLoading(true);
    try {
      const response = await fetch("/api/seed", { method: "POST", cache: "no-store" });
      if (response.ok) {
        const result = await response.json();
        setDreams(result.dreams || []);
      }
    } catch (error) {
      console.error("Seed error:", error);
    } finally {
      setIsSeeding(false);
      setIsLoading(false);
    }
  };

  const handleClearData = async () => {
    try {
      await fetch("/api/seed", { method: "DELETE", cache: "no-store" });
      setDreams([]);
    } catch (error) {
      console.error("Clear error:", error);
    }
  };

  const handleDreamClick = (dream: Dream) => {
    router.push(`/dream/${dream.id}`);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/5">
        <div className="flex items-center gap-3">
          <Moon className="text-indigo-400" size={24} />
          <h1 className="text-lg font-semibold text-white/90">梦境日志</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/about"
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm text-white/50 hover:text-white/70 transition-colors"
          >
            <Info size={14} />
            <span className="hidden sm:inline">关于</span>
          </Link>
          <Link
            href="/persons"
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm text-white/50 hover:text-white/70 transition-colors"
          >
            <Users size={14} />
            <span className="hidden sm:inline">人物库</span>
          </Link>
          <button
            onClick={handleSeedData}
            disabled={isSeeding}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm text-white/50 hover:text-white/70 transition-colors disabled:opacity-50"
            title="加载测试数据"
          >
            <Database size={14} />
            <span className="hidden sm:inline">{isSeeding ? "加载中..." : "测试数据"}</span>
          </button>
          {dreams.length > 0 && (
            <button
              onClick={handleClearData}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-red-500/20 text-sm text-white/50 hover:text-red-300 transition-colors"
              title="清除所有数据"
            >
              <Trash2 size={14} />
            </button>
          )}
          <Link
            href="/"
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-sm transition-colors"
          >
            <Plus size={16} />
            记录梦境
          </Link>
        </div>
      </header>

      <main className="flex-1 px-6 py-8 max-w-4xl mx-auto w-full">
        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <JournalTimeline dreams={dreams} onDreamClick={handleDreamClick} />
        )}
      </main>
    </div>
  );
}
