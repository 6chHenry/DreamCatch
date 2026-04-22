"use client";

import { useState, useEffect, useCallback } from "react";
import { Moon, Users, BookOpen, Info } from "lucide-react";
import type { Person } from "@/types/dream";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function PersonsPage() {
  const router = useRouter();
  const [persons, setPersons] = useState<Person[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchPersons = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/persons", { cache: "no-store" });
      if (response.ok) {
        const data = await response.json();
        setPersons(data);
      }
    } catch (error) {
      console.error("Fetch persons error:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPersons();
  }, [fetchPersons]);

  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        fetchPersons();
      }
    };
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, [fetchPersons]);

  const handlePersonClick = (person: Person) => {
    router.push(`/person/${person.id}`);
  };

  const getAvatarColor = (name: string) => {
    const colors = [
      "from-rose-500 to-pink-600",
      "from-violet-500 to-purple-600",
      "from-blue-500 to-cyan-600",
      "from-emerald-500 to-teal-600",
      "from-amber-500 to-orange-600",
      "from-indigo-500 to-blue-600",
      "from-fuchsia-500 to-pink-600",
      "from-lime-500 to-green-600",
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/5">
        <div className="flex items-center gap-3">
          <Moon className="text-indigo-400" size={24} />
          <h1 className="text-lg font-semibold text-white/90">人物库</h1>
          <span className="text-xs text-white/30">{persons.length} 人</span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/about"
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm text-white/50 hover:text-white/70 transition-colors"
          >
            <Info size={14} />
            关于
          </Link>
          <Link
            href="/journal"
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm text-white/50 hover:text-white/70 transition-colors"
          >
            <BookOpen size={14} />
            梦境日志
          </Link>
          <Link
            href="/"
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-sm transition-colors"
          >
            记录梦境
          </Link>
        </div>
      </header>

      <main className="flex-1 px-6 py-8 max-w-4xl mx-auto w-full">
        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : persons.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <Users size={48} className="text-white/10" />
            <p className="text-white/30 text-sm">还没有记录到梦境中的人物</p>
            <p className="text-white/20 text-xs">记录梦境时，系统会自动提取其中出现的人物</p>
            <Link
              href="/"
              className="mt-4 px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-sm transition-colors"
            >
              记录第一个梦境
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {persons.map((person) => (
              <button
                key={person.id}
                onClick={() => handlePersonClick(person)}
                className="group rounded-xl bg-white/[0.03] border border-white/10 p-5 text-left hover:bg-white/[0.06] hover:border-white/20 transition-all"
              >
                <div className="flex items-center gap-4">
                  <div className="relative w-12 h-12 shrink-0 rounded-full overflow-hidden border border-white/10">
                    {person.referenceImageFilename ? (
                      <img
                        src={`/api/person-reference/${encodeURIComponent(person.referenceImageFilename)}`}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div
                        className={`w-full h-full bg-gradient-to-br ${getAvatarColor(
                          person.name
                        )} flex items-center justify-center`}
                      >
                        <span className="text-lg font-medium text-white">{person.name.charAt(0)}</span>
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-medium text-white/80 truncate group-hover:text-white transition-colors">
                      {person.name}
                    </h3>
                    <p className="text-xs text-white/30 mt-0.5">
                      出现 {person.appearances} 次
                    </p>
                  </div>
                </div>

                {person.relationships.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {person.relationships.slice(0, 3).map((rel, i) => (
                      <span
                        key={i}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300/70"
                      >
                        {rel}
                      </span>
                    ))}
                    {person.relationships.length > 3 && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-white/20">
                        +{person.relationships.length - 3}
                      </span>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5">
                  <span className="text-[10px] text-white/20">
                    {person.dreamIds.length} 个梦境
                  </span>
                  <span className="text-[10px] text-white/20">
                    最近 {new Date(person.lastSeen).toLocaleDateString("zh-CN")}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
