import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { getSetting } from "../services/siteSettings.js";
import { ratingStats, serializeVideoSummary } from "../services/serializers.js";
import { forbidden, notFound } from "../utils/errors.js";
import { mediaUrl } from "../utils/media.js";

const videoIdParamSchema = z.object({ videoId: z.string().trim().min(1) });

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function loadEmbeddable(videoId: string) {
  const embeddingEnabled = await getSetting<boolean>("embeddingEnabled");
  if (!embeddingEnabled) throw forbidden("Embedding is disabled.");

  const video = await prisma.video.findUnique({
    where: { id: videoId },
    include: {
      owner: { select: { id: true, username: true, isVerified: true } },
      variants: { orderBy: { label: "desc" } }
    }
  });
  if (!video || video.status !== "READY" || video.visibility === "PRIVATE") throw notFound("Video unavailable.");
  if (!video.allowEmbedding) throw forbidden("Embedding is disabled for this video.");
  return video;
}

export async function registerEmbedRoutes(app: FastifyInstance) {
  app.get("/api/embed/:videoId", async (request) => {
    const { videoId } = videoIdParamSchema.parse(request.params);
    const video = await loadEmbeddable(videoId);
    const stats = await ratingStats([video.id]);
    return {
      video: {
        ...serializeVideoSummary(video, stats.get(video.id)),
        description: video.description,
        processedUrl: mediaUrl(video.processedFilePath),
        variants: video.variants.map((variant) => ({
          label: variant.label,
          url: mediaUrl(variant.filePath),
          width: variant.width,
          height: variant.height
        })),
        watchUrl: `${env.FRONTEND_ORIGIN}/watch/${video.id}`
      }
    };
  });

  app.get("/embed/:videoId", async (request, reply) => {
    const { videoId } = videoIdParamSchema.parse(request.params);
    const video = await loadEmbeddable(videoId);
    const title = escapeHtml(video.title);
    const source = mediaUrl(video.processedFilePath);
    const poster = mediaUrl(video.thumbnailPath);
    if (!source) throw notFound("Video unavailable.");

    await reply.type("text/html; charset=utf-8").send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} - OpenTube</title>
  <style>
    html,body{margin:0;background:#111;color:#fff;font:12px Arial,Helvetica,sans-serif}
    .wrap{width:100vw;height:100vh;display:flex;flex-direction:column}
    video{width:100%;height:calc(100vh - 46px);background:#000;display:block}
    .bar{height:46px;background:linear-gradient(#333,#111);border-top:1px solid #555;display:flex;align-items:center;gap:6px;padding:0 8px;box-sizing:border-box}
    button{font:11px Arial;border:1px solid #777;background:#ddd;color:#111;padding:3px 8px;cursor:pointer}
    input[type=range]{flex:1}
    a{color:#99c2ff}
  </style>
</head>
<body>
  <div class="wrap">
    <video id="v" preload="metadata" poster="${poster ?? ""}" src="${source}"></video>
    <div class="bar">
      <button id="play" type="button">Play</button>
      <input id="seek" type="range" min="0" value="0" step="0.1">
      <span id="time">0:00 / 0:00</span>
      <button id="mute" type="button">Mute</button>
      <button id="full" type="button">Full</button>
      <a href="${env.FRONTEND_ORIGIN}/watch/${video.id}" target="_blank" rel="noopener">Watch on OpenTube</a>
    </div>
  </div>
  <script>
    const v=document.getElementById('v'),p=document.getElementById('play'),s=document.getElementById('seek'),t=document.getElementById('time'),m=document.getElementById('mute'),f=document.getElementById('full');
    const fmt=x=>{x=Math.max(0,Math.floor(x||0));return Math.floor(x/60)+':'+String(x%60).padStart(2,'0')};
    const tick=()=>{s.max=v.duration||0;s.value=v.currentTime||0;t.textContent=fmt(v.currentTime)+' / '+fmt(v.duration);p.textContent=v.paused?'Play':'Pause'};
    p.onclick=()=>v.paused?v.play():v.pause(); m.onclick=()=>{v.muted=!v.muted;m.textContent=v.muted?'Unmute':'Mute'}; f.onclick=()=>document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen();
    s.oninput=()=>{v.currentTime=Number(s.value)}; ['timeupdate','durationchange','play','pause'].forEach(e=>v.addEventListener(e,tick)); tick();
  </script>
</body>
</html>`);
  });
}
