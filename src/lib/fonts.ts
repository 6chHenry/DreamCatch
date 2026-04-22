import { ZCOOL_XiaoWei } from "next/font/google";

/**
 * 首页轮播标题字体（与正文系统字体区分）。
 *
 * 想换风格时，把上面的 import 和下面的 `dreamHeadlineFont = …` 改成其一即可（均为 `next/font/google`）：
 * - **ZCOOL_XiaoWei**（当前）：站酷小薇体，清爽、偏标题感，长句也耐看
 * - **Noto_Serif_SC**：思源宋体，传统衬线、稳
 * - **Ma_Shan_Zheng**：马善政楷书，毛笔匾额感，很醒目，适合短标题
 * - **Zhi_Mang_Xing**：稚芒行，偏手写、柔和
 */
export const dreamHeadlineFont = ZCOOL_XiaoWei({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-dream-headline",
  display: "swap",
});
