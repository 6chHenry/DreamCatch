"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Moon, ArrowLeft, Users, Calendar, Link2, ImagePlus, Trash2, Loader2 } from "lucide-react";
import type { Person, Dream } from "@/types/dream";

export default function PersonDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [person, setPerson] = useState<Person | null>(null);
  const [dreams, setDreams] = useState<Dream[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refUploading, setRefUploading] = useState(false);

  useEffect(() => {
    if (params.id) {
      fetchPerson(params.id as string);
    }
  }, [params.id]);

  const fetchPerson = async (id: string) => {
    try {
      const [personRes, dreamsRes] = await Promise.all([
        fetch(`/api/persons/${id}`, { cache: "no-store" }),
        fetch(`/api/dreams`, { cache: "no-store" }),
      ]);

      if (personRes.ok) {
        const personData = await personRes.json();
        setPerson(personData);

        if (dreamsRes.ok) {
          const allDreams: Dream[] = await dreamsRes.json();
          const relatedDreams = allDreams.filter((d) =>
            personData.dreamIds.includes(d.id)
          );
          setDreams(relatedDreams);
        }
      }
    } catch (error) {
      console.error("Fetch person error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const referenceImageUrl = person?.referenceImageFilename
    ? `/api/person-reference/${encodeURIComponent(person.referenceImageFilename)}`
    : null;

  const handleReferenceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !person) return;
    setRefUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/persons/${person.id}/reference-image`, {
        method: "POST",
        body: fd,
      });
      if (res.ok) {
        setPerson(await res.json());
      }
    } catch (err) {
      console.error("Reference upload error:", err);
    } finally {
      setRefUploading(false);
    }
  };

  const handleReferenceDelete = async () => {
    if (!person) return;
    setRefUploading(true);
    try {
      const res = await fetch(`/api/persons/${person.id}/reference-image`, { method: "DELETE" });
      if (res.ok) {
        setPerson(await res.json());
      }
    } catch (err) {
      console.error("Reference delete error:", err);
    } finally {
      setRefUploading(false);
    }
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

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!person) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-white/40">人物未找到</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
          >
            <ArrowLeft size={16} />
          </button>
          <Moon className="text-indigo-400" size={20} />
          <h1 className="text-lg font-semibold text-white/90">人物详情</h1>
        </div>
        <button
          onClick={() => router.push("/persons")}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm text-white/50 hover:text-white/70 transition-colors"
        >
          <Users size={14} />
          人物库
        </button>
      </header>

      <main className="flex-1 px-6 py-8 max-w-4xl mx-auto w-full space-y-8">
        <div className="flex items-center gap-6">
          <div className="relative shrink-0">
            {referenceImageUrl ? (
              <div className="w-20 h-20 rounded-full overflow-hidden border border-white/15 ring-2 ring-indigo-500/20">
                <img
                  src={referenceImageUrl}
                  alt={`${person.name} 参考图`}
                  className="w-full h-full object-cover"
                />
              </div>
            ) : (
              <div
                className={`w-20 h-20 rounded-full bg-gradient-to-br ${getAvatarColor(
                  person.name
                )} flex items-center justify-center`}
              >
                <span className="text-3xl font-medium text-white">{person.name.charAt(0)}</span>
              </div>
            )}
          </div>
          <div>
            <h2 className="text-2xl font-light text-white/90">{person.name}</h2>
            <div className="flex items-center gap-4 mt-2">
              <span className="text-sm text-white/40 flex items-center gap-1.5">
                <Calendar size={12} />
                出现 {person.appearances} 次
              </span>
              <span className="text-sm text-white/40 flex items-center gap-1.5">
                <Link2 size={12} />
                {person.dreamIds.length} 个梦境
              </span>
            </div>
            <p className="text-xs text-white/20 mt-1">
              首次出现 {new Date(person.firstSeen).toLocaleDateString("zh-CN")}
              {" · "}
              最近出现 {new Date(person.lastSeen).toLocaleDateString("zh-CN")}
            </p>
          </div>
        </div>

        <section className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-medium text-white/70">生图参考图</h3>
              <p className="text-xs text-white/35 mt-1 max-w-xl">
                上传一张该人物的照片或画像。之后在梦境场景描述里若出现 Ta，生成场景图时会一并传给模型以保持外貌一致（需场景文案里能对应到该人物姓名或身份）。
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {referenceImageUrl && (
                <button
                  type="button"
                  onClick={handleReferenceDelete}
                  disabled={refUploading}
                  className="p-2 rounded-lg bg-white/5 text-white/50 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                  title="移除参考图"
                >
                  {refUploading ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                </button>
              )}
              <label className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-500/20 text-indigo-200 text-xs cursor-pointer hover:bg-indigo-500/30 transition-colors disabled:opacity-50">
                {refUploading ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
                {referenceImageUrl ? "更换" : "上传"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  disabled={refUploading}
                  onChange={handleReferenceUpload}
                />
              </label>
            </div>
          </div>
          {referenceImageUrl && (
            <div className="mt-4 rounded-lg overflow-hidden border border-white/10 max-w-xs">
              <img src={referenceImageUrl} alt="参考图预览" className="w-full h-auto object-cover max-h-48" />
            </div>
          )}
        </section>

        {person.relationships.length > 0 && (
          <section>
            <h3 className="text-sm font-medium text-white/50 mb-3">关系标签</h3>
            <div className="flex flex-wrap gap-2">
              {person.relationships.map((rel, i) => (
                <span
                  key={i}
                  className="text-xs px-3 py-1.5 rounded-full bg-indigo-500/10 text-indigo-300/80 border border-indigo-500/20"
                >
                  {rel}
                </span>
              ))}
            </div>
          </section>
        )}

        <section>
          <h3 className="text-sm font-medium text-white/50 mb-4">相关梦境</h3>
          {dreams.length === 0 ? (
            <p className="text-sm text-white/30">暂无关联梦境</p>
          ) : (
            <div className="space-y-3">
              {dreams.map((dream) => (
                <button
                  key={dream.id}
                  onClick={() => router.push(`/dream/${dream.id}`)}
                  className="w-full rounded-xl bg-white/[0.03] border border-white/10 p-4 text-left hover:bg-white/[0.06] hover:border-white/20 transition-all group"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-medium text-white/70 group-hover:text-white transition-colors">
                        {dream.title}
                      </h4>
                      <p className="text-xs text-white/30 mt-1 line-clamp-2">
                        {dream.structured.narrative.summary || dream.rawText.slice(0, 100)}
                      </p>
                      {dream.structured.characters.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {dream.structured.characters
                            .filter((c) => (c.name || c.identity) !== person.name)
                            .slice(0, 3)
                            .map((c, i) => (
                              <span
                                key={i}
                                className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-white/30"
                              >
                                {c.name || c.identity}
                              </span>
                            ))}
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="text-[10px] text-white/20">
                        {new Date(dream.createdAt).toLocaleDateString("zh-CN")}
                      </span>
                      {dream.scenes.filter((s) => s.imageUrl).length > 0 && (
                        <div className="mt-1 w-16 h-10 rounded overflow-hidden">
                          <img
                            src={dream.scenes.find((s) => s.imageUrl)?.imageUrl}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
