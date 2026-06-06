import { Link, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import type * as React from "react";
import type { CommentDto, VideoDetail, VideoSummary } from "@opentube/shared";
import { api } from "../api/client.js";
import { useAuth } from "../api/auth.js";
import {
  EmbedCodeBox,
  FlashStylePlayer,
  LoadingBox,
  Notice,
  OldButton,
  OldTextarea,
  SectionBox,
  SidebarBox,
  StarRating,
  VerifiedBadge,
  VideoGrid,
  avatarSrc,
  formatDate
} from "../components/ui.js";

function CommentItem({
  comment,
  allComments,
  onReply,
  onRemove
}: {
  comment: CommentDto;
  allComments: CommentDto[];
  onReply: (comment: CommentDto) => void;
  onRemove: (id: string) => void;
}) {
  const { user } = useAuth();
  const replies = allComments.filter((item) => item.parentId === comment.id);
  return (
    <div className="comment">
      <div className="comment-row">
        <img className="comment-avatar" src={avatarSrc(comment.userAvatarPath)} alt="" />
        <div className="comment-content">
          <div className="comment-heading">
            <Link to={`/user/${comment.username}`}>{comment.username}</Link>
            {comment.userIsVerified ? <VerifiedBadge /> : null}
            <span className="meta">posted on {formatDate(comment.createdAt)}</span>
          </div>
          <div>{comment.body}</div>
          {!comment.isRemoved ? (
            <div>
              {user ? <button className="link-button" type="button" onClick={() => onReply(comment)}>Reply</button> : null}
              {user && (user.id === comment.userId || user.role === "MODERATOR" || user.role === "ADMIN") ? (
                <>
                  {" | "}
                  <button className="link-button" type="button" onClick={() => onRemove(comment.id)}>Remove</button>
                </>
              ) : null}
            </div>
          ) : null}
          {replies.map((reply) => (
            <div className="comment-reply" key={reply.id}>
              <CommentItem comment={reply} allComments={allComments} onReply={onReply} onRemove={onRemove} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CommentsBox({ videoId }: { videoId: string }) {
  const { user } = useAuth();
  const [comments, setComments] = useState<CommentDto[]>([]);
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<CommentDto | null>(null);
  const [error, setError] = useState("");

  async function load() {
    const response = await api.videos.comments(videoId);
    setComments(response.items);
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : "Comments failed to load."));
  }, [videoId]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await api.videos.comment(videoId, body, replyTo?.id);
      setBody("");
      setReplyTo(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not post comment.");
    }
  }

  async function remove(id: string) {
    setError("");
    try {
      await api.videos.deleteComment(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove comment.");
    }
  }

  const roots = comments.filter((comment) => !comment.parentId);

  return (
    <SectionBox title="Comments & Responses">
      {error ? <Notice kind="error">{error}</Notice> : null}
      {user ? (
        <form className="form-grid" onSubmit={submit}>
          {replyTo ? <Notice kind="blue">Replying to {replyTo.username}. <button className="link-button" type="button" onClick={() => setReplyTo(null)}>Cancel</button></Notice> : null}
          <OldTextarea value={body} maxLength={2000} onChange={(event) => setBody(event.target.value)} required />
          <OldButton type="submit">Post Comment</OldButton>
        </form>
      ) : (
        <Notice kind="blue"><Link to="/login">Login</Link> to comment.</Notice>
      )}
      {roots.map((comment) => (
        <CommentItem key={comment.id} comment={comment} allComments={comments} onReply={setReplyTo} onRemove={(id) => void remove(id)} />
      ))}
      {!roots.length ? <div className="empty-state">No comments yet.</div> : null}
    </SectionBox>
  );
}

export function WatchPage() {
  const { videoId = "" } = useParams();
  const { user } = useAuth();
  const [video, setVideo] = useState<VideoDetail | null>(null);
  const [related, setRelated] = useState<VideoSummary[]>([]);
  const [more, setMore] = useState<VideoSummary[]>([]);
  const [subscribed, setSubscribed] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setError("");
    const response = await api.videos.get(videoId);
    setVideo(response.video);
    if (response.video.status === "READY") {
      void api.videos.view(videoId).then((view) => setVideo((current) => current ? { ...current, views: view.views } : current));
    }
    const [relatedResponse, moreResponse, channelResponse] = await Promise.all([
      api.videos.search(`?q=${encodeURIComponent(response.video.category)}&page=1&pageSize=8`),
      api.users.videos(response.video.ownerUsername),
      api.users.get(response.video.ownerUsername)
    ]);
    setRelated(relatedResponse.items.filter((item) => item.id !== response.video.id).slice(0, 6));
    setMore(moreResponse.items.filter((item) => item.id !== response.video.id).slice(0, 6));
    setSubscribed(channelResponse.isSubscribed);
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : "Video failed to load."));
  }, [videoId]);

  useEffect(() => {
    if (video?.status !== "PROCESSING" && video?.status !== "UPLOADING") return;
    const timer = window.setInterval(() => {
      void load().catch((err) => setError(err instanceof Error ? err.message : "Video failed to load."));
    }, 8000);
    return () => window.clearInterval(timer);
  }, [video?.status, videoId]);

  async function rate(value: number) {
    if (!video) return;
    try {
      const response = await api.videos.rate(video.id, value);
      setVideo({ ...video, viewerRating: value, averageRating: response.stats.averageRating, ratingCount: response.stats.ratingCount });
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not rate video.");
    }
  }

  async function favorite() {
    if (!video) return;
    try {
      if (video.isFavorited) await api.videos.unfavorite(video.id);
      else await api.videos.favorite(video.id);
      setVideo({ ...video, isFavorited: !video.isFavorited });
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not update favorites.");
    }
  }

  async function subscribe() {
    if (!video) return;
    try {
      if (subscribed) await api.users.unsubscribe(video.ownerUsername);
      else await api.users.subscribe(video.ownerUsername);
      setSubscribed(!subscribed);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not update subscription.");
    }
  }

  async function flag() {
    if (!video) return;
    const reason = window.prompt("Why is this inappropriate?");
    if (!reason) return;
    try {
      await api.reports.create("VIDEO", video.id, reason);
      setNotice("Report submitted for moderator review.");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not submit report.");
    }
  }

  if (error) return <Notice kind="error">{error}</Notice>;
  if (!video) return <LoadingBox label="Loading video..." />;

  if (video.status === "PROCESSING" || video.status === "UPLOADING") {
    return (
      <SectionBox title={video.title}>
        <Notice kind="blue">This video is processing. The page will refresh automatically.</Notice>
        <div className="status-pill">{video.status}</div>
      </SectionBox>
    );
  }

  if (video.status === "FAILED") {
    return (
      <SectionBox title={video.title}>
        <Notice kind="error">Video processing failed. The uploader can replace the file from Account Videos.</Notice>
      </SectionBox>
    );
  }

  return (
    <div className="watch-layout">
      <div>
        <h1 className="watch-title">{video.title}</h1>
        {notice ? <Notice kind={notice.includes("submitted") ? "yellow" : "error"}>{notice}</Notice> : null}
        <FlashStylePlayer src={video.processedUrl} poster={video.thumbnailUrl} title={video.title} />
        <div className="watch-meta-row">
          <strong>{video.views.toLocaleString()} views</strong>
          <span className="meta">Added: {formatDate(video.createdAt)}</span>
          <span className="meta">From: <Link to={`/user/${video.ownerUsername}`}>{video.ownerUsername}</Link>{video.ownerIsVerified ? <VerifiedBadge /> : null}</span>
          <span className="meta">Category: <Link to={`/videos?category=${encodeURIComponent(video.category)}`}>{video.category}</Link></span>
        </div>
        <div className="watch-meta-row">
          <StarRating value={video.viewerRating ?? video.averageRating} count={video.ratingCount} onRate={user ? rate : undefined} />
          {user && user.username !== video.ownerUsername ? <OldButton onClick={() => void subscribe()}>{subscribed ? "Unsubscribe" : "Subscribe"}</OldButton> : null}
        </div>
        <SectionBox title="Video Details">
          <p>{video.description || "No description provided."}</p>
          <div className="tag-list">
            <strong>Tags:</strong>
            {video.tags.map((tag) => <Link key={tag} to={`/search?q=${encodeURIComponent(tag)}`}>{tag}</Link>)}
            {!video.tags.length ? <span className="meta">No tags</span> : null}
          </div>
          <div className="actions-row">
            {user ? <OldButton onClick={() => void favorite()}>{video.isFavorited ? "Remove Favorite" : "Favorite"}</OldButton> : null}
            <OldButton onClick={() => void navigator.clipboard.writeText(window.location.href)}>Share Video</OldButton>
            {user ? <OldButton onClick={() => void flag()}>Flag as Inappropriate</OldButton> : null}
            {user && (user.id === video.ownerId || user.role === "ADMIN") ? <OldButton onClick={() => window.location.assign("/account/videos")}>Manage Video</OldButton> : null}
          </div>
          {video.allowEmbedding ? <EmbedCodeBox videoId={video.id} /> : <Notice kind="blue">Embedding is disabled for this video.</Notice>}
        </SectionBox>
        <CommentsBox videoId={video.id} />
      </div>
      <div>
        <SidebarBox title="Related Videos">
          <VideoGrid videos={related} />
        </SidebarBox>
        <SidebarBox title="More From This User">
          <VideoGrid videos={more} />
        </SidebarBox>
      </div>
    </div>
  );
}

export function EmbedPage() {
  const { videoId = "" } = useParams();
  const [video, setVideo] = useState<Awaited<ReturnType<typeof api.embed>>["video"] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void api.embed(videoId)
      .then((response) => setVideo(response.video))
      .catch((err) => setError(err instanceof Error ? err.message : "Embed failed to load."));
  }, [videoId]);

  return (
    <div className="embed-page">
      {error ? <Notice kind="error">{error}</Notice> : null}
      {!video && !error ? <LoadingBox label="Loading embedded video..." /> : null}
      {video ? (
        <>
          <FlashStylePlayer src={video.processedUrl} poster={video.thumbnailUrl} title={video.title} compact />
          <div className="embed-watch-link"><a href={video.watchUrl} target="_blank" rel="noreferrer">Watch on OpenTube</a></div>
        </>
      ) : null}
    </div>
  );
}
