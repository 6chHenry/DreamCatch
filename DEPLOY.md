# 部署到 Vercel（推荐用于 Next.js）

掬梦（DreamCup）是标准 Next.js 应用，用 **Vercel** 部署最省事：连上 GitHub 后每次推送会自动构建。

## 1. 准备代码仓库

确保当前代码已推送到 GitHub（仓库名可与产品名不同，例如 `https://github.com/6chHenry/DreamCatch`）。

```bash
git add .
git commit -m "Prepare for Vercel deploy"
git push origin master
```

## 2. 在 Vercel 上导入项目

1. 打开 [vercel.com](https://vercel.com)，用 GitHub 登录。
2. **Add New… → Project**，选择你的项目仓库。
3. **Framework Preset** 选 **Next.js**（一般会自动识别）。
4. **Root Directory** 保持仓库根目录（本仓库无 monorepo 子目录则不用改）。
5. 点击 **Deploy**。

首次部署会跑 `npm run build`。若失败，把构建日志里的报错贴出来排查。

## 3. 配置环境变量（必做）

在 Vercel 项目：**Settings → Environment Variables**，把本地 `.env.local` 里**需要在线上生效**的变量一条条加进去（**不要**把 `.env.local` 提交到 Git）。

至少对照仓库里的 `.env.example`，按需配置例如：

- 浏览器可调用的：`NEXT_PUBLIC_LLM_*`
- 仅服务端：`DOUBAO_SPEECH_*`、`OPENCLAUDECODE_*`、`GEMINI_*`、`DOUBAO_API_*`、生图/视频相关等

每加一条变量，**Environment** 勾选 **Production**（以及需要的话 **Preview**）。

保存后，到 **Deployments** 里对最新部署点 **Redeploy**，让新环境变量生效。

## 4. 部署后要知道的限制

| 问题 | 说明 |
|------|------|
| **本地 `data/`** | Vercel 无持久磁盘；`data/dreams.json`、`data/audio/` 等**不会像本机一样长期保存**。若要线上存梦，需接数据库或对象存储（如 Vercel Blob、S3、PlanetScale 等），这是后续产品改动。 |
| **ASR 耗时** | 语音转写 + ffmpeg 可能较慢。`vercel.json` 已把 `/api/asr` 的 `maxDuration` 设为 60 秒；**免费 Hobby 套餐单次函数上限多为 10 秒**，复杂音频可能超时，需升级 Pro 或改用外部 ASR 服务。 |
| **密钥** | 密钥只放在 Vercel 环境变量，勿写进代码仓库。 |

## 5. 自定义域名（可选）

在 Vercel 项目 **Settings → Domains** 里绑定自己的域名，按提示在域名 DNS 里加解析记录即可。

---

**结论**：不是必须用 Vercel，但 Next.js + Vercel 最省心；你也可以用 **Netlify**、**Railway**、**Docker 自建 VPS** 等，思路都是 `npm run build` + `npm start` 并配好环境变量与持久化方案。
