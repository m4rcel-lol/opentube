import { Link, NavLink } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import type * as React from "react";
import type { PublicUser, VideoSummary } from "@opentube/shared";
import type { PublicSettings } from "../api/client.js";
import { useAuth } from "../api/auth.js";

export function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

export function formatDuration(seconds: number | null) {
  if (seconds === null) return "--:--";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

export function OldButton({
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={`old-button ${className}`} {...props}>
      {children}
    </button>
  );
}

export function OldInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`old-input ${props.className ?? ""}`} {...props} />;
}

export function OldTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`old-textarea ${props.className ?? ""}`} {...props} />;
}

export function SectionBox({
  title,
  children,
  action
}: {
  title: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="section-box">
      <div className="section-title">
        <span>{title}</span>
        {action ? <span className="section-action">{action}</span> : null}
      </div>
      <div className="section-body">{children}</div>
    </section>
  );
}

export function SidebarBox({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <aside className="sidebar-box">
      <div className="sidebar-title">{title}</div>
      <div className="sidebar-body">{children}</div>
    </aside>
  );
}

export function Notice({ children, kind = "yellow" }: { children: React.ReactNode; kind?: "yellow" | "blue" | "error" }) {
  return <div className={`notice notice-${kind}`}>{children}</div>;
}

export function LoadingBox({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="loading-box">
      <img src="/loading-spinner.svg" alt="" />
      <span>{label}</span>
    </div>
  );
}

export function avatarSrc(path: string | null | undefined) {
  return path || "/default-avatar.png";
}

export function VerifiedBadge() {
  return (
    <svg className="verified-badge" viewBox="0 0 16 16" role="img" aria-label="Verified channel">
      <circle cx="8" cy="8" r="7" />
      <path d="M4.3 8.2l2.1 2.2 5-5.4" />
    </svg>
  );
}

export function VideoThumb({ video, large = false, fixedPreview = false }: { video: VideoSummary; large?: boolean; fixedPreview?: boolean }) {
  return (
    <div className={`video-thumb ${large ? "video-thumb-large" : ""} ${fixedPreview ? "video-thumb-fixed" : ""}`}>
      <Link className="thumb-frame" to={`/watch/${video.id}`}>
        {video.thumbnailUrl ? (
          <img src={video.thumbnailUrl} alt="" />
        ) : (
          <span className="thumb-placeholder">OpenTube</span>
        )}
        <span className="duration">{formatDuration(video.duration)}</span>
      </Link>
      <Link className="thumb-title" to={`/watch/${video.id}`}>
        {video.title}
      </Link>
      <div className="meta">From: <Link to={`/user/${video.ownerUsername}`}>{video.ownerUsername}</Link>{video.ownerIsVerified ? <VerifiedBadge /> : null}</div>
      <div className="meta">{video.views.toLocaleString()} views</div>
      <div className="meta">Rating: {video.averageRating.toFixed(1)} ({video.ratingCount})</div>
      <div className="meta">Added: {formatDate(video.createdAt)}</div>
    </div>
  );
}

export function StarRating({
  value,
  count,
  onRate,
  disabled = false
}: {
  value: number;
  count?: number | undefined;
  onRate?: ((value: number) => void) | undefined;
  disabled?: boolean | undefined;
}) {
  const rounded = Math.round(value);
  return (
    <div className="star-rating" aria-label={`Rating ${value.toFixed(1)} out of 5`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          className={star <= rounded ? "star-on" : "star-off"}
          disabled={disabled || !onRate}
          onClick={() => onRate?.(star)}
          title={`${star} star${star === 1 ? "" : "s"}`}
        >
          *
        </button>
      ))}
      {typeof count === "number" ? <span className="meta rating-count">({count} ratings)</span> : null}
    </div>
  );
}

export function Pagination({
  page,
  totalPages,
  onPage
}: {
  page: number;
  totalPages: number;
  onPage: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  const pages = Array.from({ length: Math.min(totalPages, 12) }, (_, index) => index + 1);
  return (
    <div className="pagination">
      {page > 1 ? <OldButton onClick={() => onPage(page - 1)}>Prev</OldButton> : null}
      {pages.map((item) => (
        <button key={item} type="button" className={item === page ? "current" : ""} onClick={() => onPage(item)}>
          {item}
        </button>
      ))}
      {page < totalPages ? <OldButton onClick={() => onPage(page + 1)}>Next</OldButton> : null}
    </div>
  );
}

export function HeaderNav({ settings }: { settings?: PublicSettings | null }) {
  const { user, logout } = useAuth();
  const [q, setQ] = useState("");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    window.location.assign(`/search?q=${encodeURIComponent(q.trim())}`);
  }

  async function hardLogout() {
    await logout();
    window.location.assign("/login");
  }

  return (
    <header className="site-header">
      <div className="top-line">
        <Link to="/" className="logo" aria-label="OpenTube home">
          <img src="/opentube-logo.png" alt={settings?.siteName ?? "OpenTube"} />
        </Link>
        <div className="tagline">{settings?.tagline ?? "Broadcast Yourself, Openly."}</div>
        <div className="auth-links">
          {user ? (
            <>
              <Link to={`/user/${user.username}`}>{user.username}</Link>
              {user.isVerified ? <VerifiedBadge /> : null}
              {" | "}
              <Link to="/account">Account</Link>
              {" | "}
              {user.role === "ADMIN" || user.role === "MODERATOR" ? (
                <>
                  <Link to="/admin">Admin</Link>
                  {" | "}
                </>
              ) : null}
              <button type="button" className="link-button" onClick={() => void hardLogout()}>
                Logout
              </button>
            </>
          ) : (
            <>
              <Link to="/login">Login</Link>
              {" | "}
              <Link to="/register">Register</Link>
            </>
          )}
        </div>
      </div>
      <nav className="nav-strip">
        <NavLink to="/">Home</NavLink>
        <NavLink to="/videos">Videos</NavLink>
        <NavLink to="/channels">Channels</NavLink>
        <NavLink to="/groups">Groups</NavLink>
        <NavLink to="/community">Community</NavLink>
        <NavLink to="/upload">Upload</NavLink>
      </nav>
      <form className="search-strip" onSubmit={submit}>
        <label htmlFor="site-search">Search</label>
        <OldInput id="site-search" value={q} onChange={(event) => setQ(event.target.value)} />
        <OldButton type="submit">Search Videos</OldButton>
      </form>
    </header>
  );
}

export function EmbedCodeBox({ videoId }: { videoId: string }) {
  const code = `<iframe width="425" height="350" src="${window.location.origin}/embed/${videoId}" frameborder="0" allowfullscreen></iframe>`;
  return (
    <div className="embed-box">
      <label htmlFor="embed-code">Embed HTML</label>
      <OldTextarea id="embed-code" readOnly value={code} onFocus={(event) => event.currentTarget.select()} />
    </div>
  );
}

export function ProfileBox({
  user,
  isSubscribed,
  onToggle,
  compact = false
}: {
  user: PublicUser;
  isSubscribed?: boolean | undefined;
  onToggle?: (() => void) | undefined;
  compact?: boolean | undefined;
}) {
  const style = {
    backgroundColor: user.channelCustomization.backgroundColor,
    color: user.channelCustomization.textColor
  };
  return (
    <div className="profile-box" style={style}>
      {user.bannerPath ? (
        <div className="profile-banner">
          <img src={user.bannerPath} alt="" />
        </div>
      ) : null}
      <div className="profile-main">
        <div className="profile-avatar"><img src={avatarSrc(user.avatarPath)} alt="" /></div>
        <div className="profile-info">
          <h1>
            {user.username}
            {user.isVerified ? <VerifiedBadge /> : null}
            {user.role === "ADMIN" ? <span className="role-badge role-admin">Admin</span> : null}
            {user.role === "MODERATOR" ? <span className="role-badge role-moderator">Moderator</span> : null}
          </h1>
          {compact ? null : <p>{user.channelDescription || "No channel description yet."}</p>}
          {compact ? null : (
            <div className="profile-stats">
              <span>Joined: {formatDate(user.createdAt)}</span>
              <span>Last Login: {user.lastLoginAt ? formatDate(user.lastLoginAt) : "Unknown"}</span>
              <span>Videos: {user.stats?.videosUploaded ?? 0}</span>
              <span>Subscribers: {user.stats?.subscribers ?? 0}</span>
              <span>Total Views: {(user.stats?.totalViews ?? 0).toLocaleString()}</span>
            </div>
          )}
          {!compact && onToggle ? (
            <OldButton onClick={onToggle}>{isSubscribed ? "Unsubscribe" : "Subscribe"}</OldButton>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function AdminTable({
  headers,
  rows
}: {
  headers: string[];
  rows: Array<Array<React.ReactNode>>;
}) {
  return (
    <table className="admin-table">
      <thead>
        <tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={index}>
            {row.map((cell, cellIndex) => (
              <td key={cellIndex}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function FlashStylePlayer({
  src,
  poster,
  title,
  compact = false
}: {
  src: string | null;
  poster?: string | null;
  title: string;
  compact?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [paused, setPaused] = useState(true);
  const [muted, setMuted] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [buffered, setBuffered] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(Boolean(src));

  const percent = duration > 0 ? (time / duration) * 100 : 0;
  const bufferPercent = duration > 0 ? (buffered / duration) * 100 : 0;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = volume;
  }, [volume]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const update = () => {
      setPaused(video.paused);
      setTime(video.currentTime || 0);
      setDuration(video.duration || 0);
      const end = video.buffered.length ? video.buffered.end(video.buffered.length - 1) : 0;
      setBuffered(end);
      setLoading(false);
    };
    const onError = () => {
      setError("Video playback failed.");
      setLoading(false);
    };
    ["loadedmetadata", "timeupdate", "progress", "play", "pause", "canplay"].forEach((event) => video.addEventListener(event, update));
    video.addEventListener("error", onError);
    return () => {
      ["loadedmetadata", "timeupdate", "progress", "play", "pause", "canplay"].forEach((event) => video.removeEventListener(event, update));
      video.removeEventListener("error", onError);
    };
  }, [src]);

  function togglePlay() {
    const video = videoRef.current;
    if (!video || !src) return;
    if (video.paused) void video.play();
    else video.pause();
  }

  function seek(value: number) {
    const video = videoRef.current;
    if (!video || !Number.isFinite(value)) return;
    video.currentTime = value;
    setTime(value);
  }

  function setPlayerVolume(value: number) {
    const video = videoRef.current;
    if (!video) return;
    const safeValue = Math.min(1, Math.max(0, value));
    video.volume = safeValue;
    video.muted = false;
    setMuted(false);
    setVolume(safeValue);
  }

  function toggleMute() {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  }

  function fullscreen() {
    const shell = shellRef.current;
    if (!shell) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void shell.requestFullscreen();
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === " ") {
      event.preventDefault();
      togglePlay();
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      seek(Math.max(0, time - 5));
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      seek(Math.min(duration, time + 5));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setPlayerVolume(volume + 0.1);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setPlayerVolume(volume - 0.1);
    } else if (event.key.toLowerCase() === "f") {
      event.preventDefault();
      fullscreen();
    }
  }

  return (
    <div className={`flash-player ${compact ? "flash-player-compact" : ""}`} ref={shellRef} tabIndex={0} onKeyDown={onKeyDown}>
      <div className="video-stage">
        {src ? <video ref={videoRef} src={src} poster={poster ?? undefined} preload="metadata" aria-label={title} /> : null}
        {!src ? <div className="player-message">Video file is not available.</div> : null}
        {loading ? <div className="player-message">Loading video...</div> : null}
        {error ? <div className="player-message player-error">{error}</div> : null}
      </div>
      <div className="player-controls">
        <OldButton type="button" onClick={togglePlay} disabled={!src}>
          {paused ? "Play" : "Pause"}
        </OldButton>
        <div className="timeline-wrap">
          <div className="buffer-bar" style={{ width: `${bufferPercent}%` }} />
          <div className="progress-bar" style={{ width: `${percent}%` }} />
          <input
            type="range"
            min="0"
            max={duration || 0}
            step="0.1"
            value={time}
            onChange={(event) => seek(Number(event.target.value))}
            aria-label="Seek"
          />
        </div>
        <span className="player-time">{formatDuration(Math.floor(time))} / {formatDuration(Math.floor(duration))}</span>
        <OldButton type="button" onClick={toggleMute}>
          {muted ? "Sound" : "Mute"}
        </OldButton>
        <input
          className="volume-slider"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={muted ? 0 : volume}
          onChange={(event) => setPlayerVolume(Number(event.target.value))}
          aria-label="Volume"
        />
        <OldButton type="button" onClick={fullscreen}>Full</OldButton>
      </div>
    </div>
  );
}

export function VideoGrid({
  videos,
  largeFirst = false,
  fixedPreviews = false,
  className = ""
}: {
  videos: VideoSummary[];
  largeFirst?: boolean;
  fixedPreviews?: boolean;
  className?: string;
}) {
  const [first, ...rest] = videos;
  if (!videos.length) return <div className="empty-state">No videos found.</div>;
  return (
    <div className={`video-grid ${fixedPreviews ? "video-grid-fixed" : ""} ${className}`}>
      {largeFirst && first && !fixedPreviews ? <VideoThumb video={first} large /> : null}
      {(largeFirst && !fixedPreviews ? rest : videos).map((video) => (
        <VideoThumb key={video.id} video={video} fixedPreview={fixedPreviews} />
      ))}
    </div>
  );
}

export function CategoryLinks() {
  const categories = useMemo(
    () => ["Autos", "Comedy", "Education", "Entertainment", "Film", "Gaming", "Music", "News", "People", "Pets", "Sports", "Travel"],
    []
  );
  return (
    <ul className="link-list">
      {categories.map((category) => (
        <li key={category}>
          <Link to={`/videos?category=${encodeURIComponent(category)}`}>{category}</Link>
        </li>
      ))}
    </ul>
  );
}
