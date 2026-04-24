"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Moon, Plus, Database, Trash2, Users, Info, Loader2, Upload } from "lucide-react";
import JournalTimeline from "@/components/JournalTimeline";
import type { Dream } from "@/types/dream";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { messageFromErrorResponse } from "@/lib/llm-utils";

export default function JournalPage() {
  const router = useRouter();
  const [dreams, setDreams] = useState<Dream[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSeeding, setIsSeeding] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [importZipBusy, setImportZipBusy] = useState(false);
  const importZipInputRef = useRef<HTMLInputElement>(null);

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

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelected(new Set());
  };

  const handleToggleSelect = (dream: Dream) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(dream.id)) n.delete(dream.id);
      else n.add(dream.id);
      return n;
    });
  };

  const handleDeleteSelected = async () => {
    if (selected.size === 0) return;
    if (
      !confirm(
        `从日志列表移除选中的 ${selected.size} 条？\n\n记录仍保留在本地 data/dreams.json（含图片等），不会从磁盘抹除；若需彻底删除请自行编辑数据文件。`
      )
    ) {
      return;
    }
    setDeleteBusy(true);
    try {
      const ids = [...selected];
      for (const id of ids) {
        const res = await fetch(`/api/dreams/${id}`, { method: "DELETE" });
        if (!res.ok) {
          window.alert(await messageFromErrorResponse(res));
          await fetchDreams();
          return;
        }
      }
      exitSelectionMode();
      await fetchDreams();
    } catch (e) {
      console.error("Delete dreams error:", e);
      window.alert(e instanceof Error ? e.message : "删除失败");
    } finally {
      setDeleteBusy(false);
    }
  };

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

  const handleDreamClick = (dream: Dream) => {
    router.push(`/dream/${dream.id}`);
  };

  const handleImportZipPick = () => importZipInputRef.current?.click();

  const handleImportZipChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImportZipBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/dreams/import-zip", { method: "POST", body: fd });
      if (!res.ok) {
        window.alert(await messageFromErrorResponse(res));
        return;
      }
      const dream = (await res.json()) as Dream;
      await fetchDreams();
      router.push(`/dream/${dream.id}`);
    } catch (err) {
      console.error("Import zip error:", err);
      window.alert(err instanceof Error ? err.message : "导入失败");
    } finally {
      setImportZipBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/5">
        <div className="flex items-center gap-3">
          <Moon className="text-indigo-400" size={24} />
          <h1 className="text-lg font-semibold text-white/90">梦境日志</h1>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <input
            ref={importZipInputRef}
            type="file"
            accept=".zip,application/zip,application/x-zip-compressed"
            className="hidden"
            onChange={handleImportZipChange}
          />
          <button
            type="button"
            onClick={handleImportZipPick}
            disabled={importZipBusy}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm text-white/50 hover:text-white/70 transition-colors disabled:opacity-50"
            title="导入与「导出 ZIP」相同格式的压缩包（含 dream.md 与场景图）"
          >
            {importZipBusy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            <span className="hidden sm:inline">{importZipBusy ? "导入中…" : "导入 ZIP"}</span>
          </button>
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
            <>
              {selectionMode ? (
                <>
                  <button
                    type="button"
                    onClick={handleDeleteSelected}
                    disabled={deleteBusy || selected.size === 0}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-sm text-rose-300 border border-rose-500/25 transition-colors disabled:opacity-40"
                  >
                    {deleteBusy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    删除选中
                    {selected.size > 0 ? ` (${selected.size})` : ""}
                  </button>
                  <button
                    type="button"
                    onClick={exitSelectionMode}
                    className="px-3 py-2 rounded-lg bg-white/10 text-sm text-white/80 border border-white/15 hover:bg-white/15"
                  >
                    完成
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setSelectionMode(true)}
                  className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm text-white/55 hover:text-white/80 border border-white/10"
                >
                  选择
                </button>
              )}
            </>
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

      {selectionMode && dreams.length > 0 && (
        <p className="mx-6 mt-3 text-[11px] text-white/30">
          多选模式：点击卡片勾选；「删除选中」只从列表隐藏，数据仍保留在 data/dreams.json。点「完成」退出多选。
        </p>
      )}

      <main className="flex-1 px-6 py-8 max-w-4xl mx-auto w-full">
        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <JournalTimeline
            dreams={dreams}
            onDreamClick={handleDreamClick}
            selectionMode={selectionMode}
            selectedIds={selected}
            onToggleSelect={handleToggleSelect}
          />
        )}
      </main>
    </div>
  );
}
