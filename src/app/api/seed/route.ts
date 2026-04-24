import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { createDream, clearAllDreams, getAllDreamRecords } from "@/lib/dream-store";
import type { Dream } from "@/types/dream";

const MOCK_DREAMS: Omit<Dream, "id">[] = [
  {
    title: "深海图书馆",
    rawText: "我梦到我在一个海底的图书馆里，书架一直延伸到看不见的黑暗中。水是暖的，但我能呼吸。有一本发光的书一直在远处飘，我游过去但永远够不到。后来一个穿潜水服的老人递给了我，打开一看全是空白的页，但我能听到文字在说话。",
    structured: {
      scenes: [
        {
          id: "scene_1",
          description: "海底图书馆，书架延伸至黑暗深处，温暖的海水中可以呼吸",
          lighting: "幽暗的蓝绿色生物发光",
          colorTone: "深海蓝绿色调",
          spatialLayout: "无限延伸的书架走廊，垂直和水平方向都看不到尽头",
        },
        {
          id: "scene_2",
          description: "发光的书在远处漂浮，追逐但无法触及",
          lighting: "书本发出柔和的金色光芒",
          colorTone: "金色光点在深蓝背景中",
        },
        {
          id: "scene_3",
          description: "穿潜水服的老人递来书本，打开是空白页但有声音",
          lighting: "金色光芒照亮老人的面罩",
          colorTone: "暖金与冷蓝的对比",
        },
      ],
      characters: [
        {
          id: "char_1",
          identity: "穿潜水服的老人",
          appearance: "老旧的铜色潜水服，面罩后面看不清脸",
          relationship: "神秘的引导者",
        },
      ],
      narrative: {
        events: [
          { description: "在海底图书馆中发现自己在水中可以呼吸", isTurningPoint: false },
          { description: "看到远处发光的书，开始追逐", isTurningPoint: false },
          { description: "无论如何游都够不到那本书", isTurningPoint: true, cause: "距离似乎在拉伸" },
          { description: "老人出现并递给我书", isTurningPoint: true },
          { description: "打开书是空白页，但能听到文字说话", isTurningPoint: true },
        ],
        summary: "在海底图书馆中追逐一本发光的书，最终由神秘老人递给我，发现空白页上有声音在说话",
      },
      emotions: [
        { type: "惊奇", intensity: 7, trigger: "发现可以在水下呼吸", timestamp: "开头" },
        { type: "渴望", intensity: 8, trigger: "看到发光的书", timestamp: "中间" },
        { type: "挫败", intensity: 5, trigger: "够不到书", timestamp: "中间" },
        { type: "敬畏", intensity: 6, trigger: "老人出现", timestamp: "结尾" },
        { type: "困惑", intensity: 7, trigger: "空白页上有声音", timestamp: "结尾" },
      ],
      sensory: {
        auditory: "水流的嗡嗡声，远处书本的低语",
        tactile: "温暖的水流包裹全身，书本触感冰凉光滑",
        olfactory: "旧书纸张和海盐的混合气味",
        temperature: "温暖的海水",
        kinesthetic: "在水中缓慢游动，身体轻盈漂浮",
      },
      anomalies: [
        { description: "在水下可以正常呼吸", type: "physics_violation" },
        { description: "距离似乎会拉伸，永远够不到书", type: "spatial_jump" },
        { description: "空白书页上有声音在说话", type: "other" },
      ],
      meta: {
        isLucidDream: false,
        isDreamWithinDream: false,
        isRecurringDream: true,
        recurrenceCount: 3,
      },
      lowConfidence: [
        { field: "characters[0].appearance", value: "老旧的铜色潜水服", reason: "光线昏暗，可能记错细节" },
      ],
    },
    scenes: [
      {
        id: uuidv4(),
        sceneIndex: 0,
        imageUrl: "https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=800&h=450&fit=crop",
        promptUsed: "underwater library with infinite bookshelves, bioluminescent blue-green glow, dreamlike atmosphere",
        isSelected: true,
      },
      {
        id: uuidv4(),
        sceneIndex: 0,
        imageUrl: "https://images.unsplash.com/photo-1504665296338-4715e0be7a1a?w=800&h=450&fit=crop",
        promptUsed: "glowing book floating in deep ocean, golden light in dark blue water, ethereal",
        isSelected: false,
      },
    ],
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
  },
  {
    title: "天空中的列车",
    rawText: "我坐上一列在云层中行驶的火车。窗外全是粉色的云，远处的夕阳把一切都染成橙色。对面坐着一个我认识但想不起来是谁的人，她一直在笑。列车突然开始垂直上升，像过山车一样，我吓醒了。",
    structured: {
      scenes: [
        {
          id: "scene_1",
          description: "在云层中行驶的火车，窗外粉色云海，夕阳橙色",
          lighting: "温暖的夕阳橙光",
          colorTone: "粉色与橙色的暖色调",
          spatialLayout: "火车车厢内部，窗外是无尽的云海",
          weather: "晴朗，粉色云层",
        },
        {
          id: "scene_2",
          description: "列车垂直上升，像过山车",
          lighting: "夕阳逐渐变成暗红",
          colorTone: "从暖橙过渡到暗红",
        },
      ],
      characters: [
        {
          id: "char_1",
          identity: "对面坐着的神秘女人",
          appearance: "面容模糊但一直在微笑",
          relationship: "似曾相识但想不起来",
        },
      ],
      narrative: {
        events: [
          { description: "坐上云层中的火车", isTurningPoint: false },
          { description: "与对面的神秘女人对视", isTurningPoint: false },
          { description: "列车突然垂直上升", isTurningPoint: true, cause: "轨道突然转向" },
        ],
        summary: "乘坐云层中的列车，遇到神秘的微笑女人，列车突然垂直上升导致惊醒",
      },
      emotions: [
        { type: "平静", intensity: 6, trigger: "看着窗外的云海", timestamp: "开头" },
        { type: "好奇", intensity: 5, trigger: "对面的女人", timestamp: "中间" },
        { type: "恐惧", intensity: 9, trigger: "列车垂直上升", timestamp: "结尾" },
      ],
      sensory: {
        auditory: "火车轮子与轨道的节奏声，风声",
        tactile: "火车座椅的震动，上升时的失重感",
        temperature: "温暖的车厢",
        kinesthetic: "强烈的失重感，胃部上提",
      },
      anomalies: [
        { description: "火车在云层中行驶", type: "physics_violation" },
        { description: "列车垂直上升", type: "physics_violation" },
      ],
      meta: {
        isLucidDream: false,
        isDreamWithinDream: false,
        isRecurringDream: false,
      },
      lowConfidence: [],
    },
    scenes: [
      {
        id: uuidv4(),
        sceneIndex: 0,
        imageUrl: "https://images.unsplash.com/photo-1474487548417-781cb71495f3?w=800&h=450&fit=crop",
        promptUsed: "train flying through pink clouds at sunset, dreamlike, ethereal atmosphere",
        isSelected: true,
      },
    ],
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    title: "倒转的城市",
    rawText: "城市是倒着的，地面在天上，天空在脚下。我站在一栋楼的窗户上（现在是地板），往下看是云。人们都正常行走，好像没什么不对。我也开始习惯了，但突然重力翻转了，我掉向天空。",
    structured: {
      scenes: [
        {
          id: "scene_1",
          description: "倒转的城市，地面在上天空在下，人们正常生活",
          lighting: "明亮的日光从下方照射",
          colorTone: "明亮的蓝白色调",
          spatialLayout: "倒置的城市，建筑向下延伸",
        },
        {
          id: "scene_2",
          description: "重力突然翻转，掉向天空",
          lighting: "光线突然变暗",
          colorTone: "从明亮变为暗蓝",
        },
      ],
      characters: [],
      narrative: {
        events: [
          { description: "发现自己站在倒转的城市中", isTurningPoint: false },
          { description: "观察人们若无其事地生活", isTurningPoint: false },
          { description: "开始适应倒转的世界", isTurningPoint: false },
          { description: "重力突然翻转，掉向天空", isTurningPoint: true },
        ],
        summary: "在倒转的城市中短暂适应后，重力突然翻转导致坠落",
      },
      emotions: [
        { type: "困惑", intensity: 8, trigger: "发现城市是倒的", timestamp: "开头" },
        { type: "适应", intensity: 4, trigger: "观察其他人", timestamp: "中间" },
        { type: "恐惧", intensity: 9, trigger: "重力翻转", timestamp: "结尾" },
      ],
      sensory: {
        auditory: "城市的喧嚣声从上方传来",
        tactile: "脚踩在窗户玻璃上的冰凉感",
        kinesthetic: "自由落体感，风从下方吹来",
      },
      anomalies: [
        { description: "整个城市上下颠倒", type: "physics_violation" },
        { description: "重力突然翻转", type: "physics_violation" },
      ],
      meta: {
        isLucidDream: true,
        isDreamWithinDream: false,
        isRecurringDream: false,
      },
      lowConfidence: [
        { field: "meta.isLucidDream", value: "true", reason: "隐约意识到这是梦但不确定" },
      ],
    },
    scenes: [],
    createdAt: new Date(Date.now() - 3600000 * 5).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 5).toISOString(),
  },
  {
    title: "童年的后院",
    rawText: "回到了小时候家的后院，但院子大了很多倍。那棵老槐树还在，树下有个秋千。妈妈在厨房窗户后面叫我吃饭，声音很清晰。我坐在秋千上荡，越荡越高，最后荡到了云层上面。从上面看，整个城市都是微缩模型。",
    structured: {
      scenes: [
        {
          id: "scene_1",
          description: "放大的童年后院，老槐树和秋千",
          lighting: "午后的金色阳光",
          colorTone: "温暖的黄绿色调，怀旧感",
          spatialLayout: "后院但比记忆中大很多倍",
          weather: "晴朗的午后",
        },
        {
          id: "scene_2",
          description: "秋千荡到云层上方，俯瞰微缩城市",
          lighting: "明亮的阳光",
          colorTone: "从暖黄过渡到高空冷蓝",
          spatialLayout: "高空俯瞰视角",
        },
      ],
      characters: [
        {
          id: "char_1",
          identity: "妈妈",
          appearance: "厨房窗户后面的身影",
          relationship: "母亲",
        },
      ],
      narrative: {
        events: [
          { description: "回到童年后院，发现院子变大了", isTurningPoint: false },
          { description: "听到妈妈叫吃饭", isTurningPoint: false },
          { description: "坐在秋千上越荡越高", isTurningPoint: true },
          { description: "荡到云层上方，看到微缩城市", isTurningPoint: true },
        ],
        summary: "回到放大的童年后院，秋千荡到云层上方俯瞰微缩城市",
      },
      emotions: [
        { type: "温暖", intensity: 8, trigger: "回到童年场景", timestamp: "开头" },
        { type: "怀念", intensity: 7, trigger: "听到妈妈的声音", timestamp: "中间" },
        { type: "自由", intensity: 9, trigger: "秋千越荡越高", timestamp: "结尾" },
        { type: "惊奇", intensity: 6, trigger: "看到微缩城市", timestamp: "结尾" },
      ],
      sensory: {
        auditory: "妈妈叫吃饭的声音，秋千链条的吱呀声，风声",
        tactile: "秋千绳索的粗糙感，风拂过脸颊",
        olfactory: "槐花的甜香，厨房飘出的饭菜香",
        temperature: "温暖的午后阳光",
        kinesthetic: "秋千摆动的节奏感，上升的兴奋感",
      },
      anomalies: [
        { description: "后院比记忆中大很多倍", type: "spatial_jump" },
        { description: "秋千荡到云层上方", type: "physics_violation" },
        { description: "城市变成微缩模型", type: "other" },
      ],
      meta: {
        isLucidDream: false,
        isDreamWithinDream: false,
        isRecurringDream: true,
        recurrenceCount: 5,
      },
      lowConfidence: [],
    },
    scenes: [
      {
        id: uuidv4(),
        sceneIndex: 0,
        imageUrl: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&h=450&fit=crop",
        promptUsed: "childhood backyard with large tree and swing, golden afternoon light, nostalgic atmosphere, dreamlike",
        isSelected: true,
      },
      {
        id: uuidv4(),
        sceneIndex: 1,
        imageUrl: "https://images.unsplash.com/photo-1524055988636-436cfa46e59e?w=800&h=450&fit=crop",
        promptUsed: "aerial view of miniature city below clouds, swing reaching sky, surreal",
        isSelected: true,
      },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

export async function POST() {
  clearAllDreams();

  const created: Dream[] = [];
  for (const mockDream of MOCK_DREAMS) {
    const dream: Dream = {
      ...mockDream,
      id: uuidv4(),
    };
    createDream(dream);
    created.push(dream);
  }

  return NextResponse.json({
    message: `已生成 ${created.length} 条 mock 梦境数据`,
    dreams: created,
  });
}

export async function DELETE() {
  clearAllDreams();
  return NextResponse.json({ message: "已清除所有梦境数据" });
}

export async function GET() {
  const allDreams = getAllDreamRecords();
  return NextResponse.json({
    count: allDreams.length,
    dreams: allDreams,
  });
}
