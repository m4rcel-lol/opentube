import { Link, Navigate, NavLink, useLocation } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import type * as React from "react";
import type { PublicUser, VideoSummary } from "@opentube/shared";
import { api } from "../api/client.js";
import { useAuth } from "../api/auth.js";
import {
  AdminTable,
  LoadingBox,
  Notice,
  OldButton,
  OldInput,
  OldTextarea,
  SectionBox,
  VerifiedBadge,
  VideoGrid,
  avatarSrc,
  formatDate
} from "../components/ui.js";

function AccountNav() {
  return (
    <div className="notice notice-blue">
      <NavLink to="/account">Overview</NavLink>
      {" | "}
      <NavLink to="/account/profile">Profile</NavLink>
      {" | "}
      <NavLink to="/account/videos">My Videos</NavLink>
      {" | "}
      <NavLink to="/account/favorites">Favorites</NavLink>
      {" | "}
      <NavLink to="/account/subscriptions">Subscriptions</NavLink>
    </div>
  );
}

function AccountOverview({ profile }: { profile: { user: PublicUser; email: string } }) {
  const stats = profile.user.stats;
  const customization = profile.user.channelCustomization;
  return (
    <SectionBox title="Account Overview" action={<Link to={`/user/${profile.user.username}`}>View public channel</Link>}>
      <div className="account-overview-grid">
        <div className="account-card">
          <div className="account-avatar-preview">
            <img src={avatarSrc(profile.user.avatarPath)} alt="" />
          </div>
          <div className="account-card-heading">Channel Media</div>
          <div className="account-media-links">
            <Link to="/account/profile">Change profile picture</Link>
            <Link to="/account/profile">Change channel banner</Link>
          </div>
          <div className="account-card-heading">Channel Colors</div>
          <div className="account-color-swatches">
            <span title="Background" style={{ backgroundColor: customization.backgroundColor }} />
            <span title="Text" style={{ backgroundColor: customization.textColor }} />
            <span title="Links" style={{ backgroundColor: customization.linkColor }} />
          </div>
        </div>
        <div>
          <div className="account-banner-preview">
            {profile.user.bannerPath ? <img src={profile.user.bannerPath} alt="" /> : `${profile.user.username}'s Channel`}
          </div>
          <h1>{profile.user.username}{profile.user.isVerified ? <VerifiedBadge /> : null}</h1>
          <p className="meta">
            {profile.email} | Joined {formatDate(profile.user.createdAt)} | Role: {profile.user.role}
          </p>
          <p>{profile.user.channelDescription || "No channel description yet. Add one from Profile."}</p>
          <table className="account-detail-table">
            <tbody>
              <tr><th>Email</th><td>{profile.email}</td></tr>
              <tr><th>Joined</th><td>{formatDate(profile.user.createdAt)}</td></tr>
              <tr><th>Last Login</th><td>{profile.user.lastLoginAt ? formatDate(profile.user.lastLoginAt) : "Not recorded"}</td></tr>
              <tr><th>Public Channel</th><td><Link to={`/user/${profile.user.username}`}>/user/{profile.user.username}</Link></td></tr>
            </tbody>
          </table>
          <div className="account-stats-grid">
            <div className="account-stat"><strong>{stats?.videosUploaded ?? 0}</strong><span>Videos</span></div>
            <div className="account-stat"><strong>{stats?.subscribers ?? 0}</strong><span>Subscribers</span></div>
            <div className="account-stat"><strong>{(stats?.totalViews ?? 0).toLocaleString()}</strong><span>Total Views</span></div>
          </div>
          <div className="account-actions-grid">
            <Link to="/upload"><strong>Upload a Video</strong><br /><span className="meta">Add a new video to your channel.</span></Link>
            <Link to="/account/profile"><strong>Edit Profile</strong><br /><span className="meta">Set picture, banner, colors, and bio.</span></Link>
            <Link to="/account/videos"><strong>Manage Videos</strong><br /><span className="meta">Edit metadata or replace failed uploads.</span></Link>
            <Link to="/account/favorites"><strong>Favorites</strong><br /><span className="meta">Review saved videos.</span></Link>
            <Link to="/account/subscriptions"><strong>Subscriptions</strong><br /><span className="meta">Channels you follow.</span></Link>
            <Link to="/channels"><strong>Browse Channels</strong><br /><span className="meta">Find creators to subscribe to.</span></Link>
          </div>
        </div>
      </div>
    </SectionBox>
  );
}

type ProfileMessage = {
  kind: "yellow" | "blue" | "error";
  text: string;
};

type CropKind = "avatar" | "banner";

type CropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type CropDrag =
  | { mode: "move"; startX: number; startY: number; startCrop: CropRect }
  | { mode: "resize"; startX: number; startY: number; startCrop: CropRect };

type CropRequest = {
  kind: CropKind;
  url: string;
};

const cropTargets = {
  avatar: {
    title: "Crop Profile Picture",
    aspect: 1,
    width: 512,
    height: 512,
    fileName: "profile-picture.webp"
  },
  banner: {
    title: "Crop Channel Banner",
    aspect: 5,
    width: 1600,
    height: 320,
    fileName: "channel-banner.webp"
  }
} as const;

function cropMax(width: number, height: number, aspect: number) {
  let cropWidth = width;
  let cropHeight = cropWidth / aspect;
  if (cropHeight > height) {
    cropHeight = height;
    cropWidth = cropHeight * aspect;
  }
  return { width: cropWidth, height: cropHeight };
}

function clampCrop(rect: CropRect, imageWidth: number, imageHeight: number, aspect: number): CropRect {
  const max = cropMax(imageWidth, imageHeight, aspect);
  const minWidth = Math.min(max.width, aspect > 1 ? 140 : 48);
  let width = Math.min(Math.max(rect.width, minWidth), max.width);
  let height = width / aspect;
  if (height > max.height) {
    height = max.height;
    width = height * aspect;
  }
  const x = Math.min(Math.max(rect.x, 0), Math.max(0, imageWidth - width));
  const y = Math.min(Math.max(rect.y, 0), Math.max(0, imageHeight - height));
  return { x, y, width, height };
}

function centeredCrop(imageWidth: number, imageHeight: number, aspect: number): CropRect {
  const max = cropMax(imageWidth, imageHeight, aspect);
  const width = max.width * 0.86;
  const height = width / aspect;
  return {
    x: (imageWidth - width) / 2,
    y: (imageHeight - height) / 2,
    width,
    height
  };
}

async function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Crop failed."));
    }, "image/webp", 0.9);
  });
}

function ImageCropModal({
  request,
  onCancel,
  onConfirm
}: {
  request: CropRequest;
  onCancel: () => void;
  onConfirm: (file: File) => Promise<void>;
}) {
  const target = cropTargets[request.kind];
  const imageRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<CropDrag | null>(null);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [crop, setCrop] = useState<CropRect | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function syncImageSize() {
    const image = imageRef.current;
    if (!image) return;
    const box = image.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) return;
    const next = { width: box.width, height: box.height };
    setImageSize(next);
    setCrop((current) =>
      current
        ? clampCrop(current, next.width, next.height, target.aspect)
        : centeredCrop(next.width, next.height, target.aspect)
    );
  }

  useEffect(() => {
    const onResize = () => syncImageSize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [target.aspect]);

  useEffect(() => {
    function onPointerMove(event: PointerEvent) {
      const drag = dragRef.current;
      if (!drag || !imageSize) return;
      if (drag.mode === "move") {
        setCrop(clampCrop({
          ...drag.startCrop,
          x: drag.startCrop.x + event.clientX - drag.startX,
          y: drag.startCrop.y + event.clientY - drag.startY
        }, imageSize.width, imageSize.height, target.aspect));
        return;
      }
      const delta = Math.max(event.clientX - drag.startX, (event.clientY - drag.startY) * target.aspect);
      setCrop(clampCrop({
        ...drag.startCrop,
        width: drag.startCrop.width + delta,
        height: (drag.startCrop.width + delta) / target.aspect
      }, imageSize.width, imageSize.height, target.aspect));
    }

    function onPointerUp() {
      dragRef.current = null;
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [imageSize, target.aspect]);

  function startMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!crop) return;
    event.preventDefault();
    dragRef.current = {
      mode: "move",
      startX: event.clientX,
      startY: event.clientY,
      startCrop: crop
    };
  }

  function startResize(event: React.PointerEvent<HTMLSpanElement>) {
    if (!crop) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = {
      mode: "resize",
      startX: event.clientX,
      startY: event.clientY,
      startCrop: crop
    };
  }

  function resizeFromSlider(value: number) {
    if (!imageSize || !crop) return;
    const max = cropMax(imageSize.width, imageSize.height, target.aspect);
    const minWidth = Math.min(max.width, target.aspect > 1 ? 140 : 48);
    const width = minWidth + (max.width - minWidth) * (value / 100);
    const centerX = crop.x + crop.width / 2;
    const centerY = crop.y + crop.height / 2;
    setCrop(clampCrop({
      x: centerX - width / 2,
      y: centerY - (width / target.aspect) / 2,
      width,
      height: width / target.aspect
    }, imageSize.width, imageSize.height, target.aspect));
  }

  async function confirmCrop() {
    const image = imageRef.current;
    if (!image || !imageSize || !crop) return;
    setBusy(true);
    setError("");
    try {
      const scaleX = image.naturalWidth / imageSize.width;
      const scaleY = image.naturalHeight / imageSize.height;
      const canvas = document.createElement("canvas");
      canvas.width = target.width;
      canvas.height = target.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Crop failed.");
      context.drawImage(
        image,
        crop.x * scaleX,
        crop.y * scaleY,
        crop.width * scaleX,
        crop.height * scaleY,
        0,
        0,
        target.width,
        target.height
      );
      const blob = await canvasBlob(canvas);
      await onConfirm(new File([blob], target.fileName, { type: "image/webp" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Crop failed.");
      setBusy(false);
    }
  }

  const sizePercent = imageSize && crop
    ? Math.round((crop.width / cropMax(imageSize.width, imageSize.height, target.aspect).width) * 100)
    : 86;

  return (
    <div className="crop-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="crop-modal-title">
      <div className="crop-modal">
        <div className="crop-modal-title" id="crop-modal-title">{target.title}</div>
        {error ? <Notice kind="error">{error}</Notice> : null}
        <div className="crop-stage-outer">
          <div className="crop-stage">
            <img
              ref={imageRef}
              className="crop-source"
              src={request.url}
              alt=""
              onLoad={syncImageSize}
              onError={() => setError("Image could not be loaded.")}
            />
            {crop ? (
              <div
                className="crop-box"
                style={{
                  left: crop.x,
                  top: crop.y,
                  width: crop.width,
                  height: crop.height
                }}
                onPointerDown={startMove}
              >
                <span className="crop-handle" onPointerDown={startResize} />
              </div>
            ) : null}
          </div>
        </div>
        <div className="crop-controls">
          <label htmlFor="crop-size">Crop Size</label>
          <input
            id="crop-size"
            type="range"
            min="0"
            max="100"
            value={sizePercent}
            disabled={!crop || busy}
            onChange={(event) => resizeFromSlider(Number(event.currentTarget.value))}
          />
          <span className="meta">{target.width} x {target.height}</span>
        </div>
        <div className="crop-actions">
          <OldButton type="button" onClick={onCancel} disabled={busy}>Cancel</OldButton>
          <OldButton type="button" onClick={() => void confirmCrop()} disabled={!crop || busy}>
            {busy ? "Uploading..." : "Crop and Upload"}
          </OldButton>
        </div>
      </div>
    </div>
  );
}

function ProfileEditor({ profile, onReload }: { profile: { user: PublicUser; email: string }; onReload: () => Promise<void> }) {
  const [email, setEmail] = useState(profile.email);
  const [description, setDescription] = useState(profile.user.channelDescription);
  const [backgroundColor, setBackgroundColor] = useState(profile.user.channelCustomization.backgroundColor);
  const [textColor, setTextColor] = useState(profile.user.channelCustomization.textColor);
  const [linkColor, setLinkColor] = useState(profile.user.channelCustomization.linkColor);
  const [message, setMessage] = useState<ProfileMessage | null>(null);
  const [cropRequest, setCropRequest] = useState<CropRequest | null>(null);

  function beginCrop(kind: CropKind, file: File | null) {
    if (!file) return;
    if (cropRequest) URL.revokeObjectURL(cropRequest.url);
    setMessage(null);
    setCropRequest({
      kind,
      url: URL.createObjectURL(file)
    });
  }

  function closeCrop() {
    if (cropRequest) URL.revokeObjectURL(cropRequest.url);
    setCropRequest(null);
  }

  async function finishCrop(file: File) {
    const kind = cropRequest?.kind;
    closeCrop();
    if (kind === "avatar") await uploadAvatar(file);
    if (kind === "banner") await uploadBanner(file);
  }

  async function uploadAvatar(file: File | null) {
    if (!file) return;
    setMessage({ kind: "blue", text: "Uploading profile picture..." });
    try {
      await api.account.uploadAvatar(file);
      await onReload();
      setMessage({ kind: "yellow", text: "Profile picture updated." });
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : "Profile picture upload failed." });
    }
  }

  async function uploadBanner(file: File | null) {
    if (!file) return;
    setMessage({ kind: "blue", text: "Uploading channel banner..." });
    try {
      await api.account.uploadBanner(file);
      await onReload();
      setMessage({ kind: "yellow", text: "Channel banner updated." });
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : "Channel banner upload failed." });
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    try {
      await api.account.updateProfile({
        email,
        channelDescription: description,
        channelCustomization: { backgroundColor, textColor, linkColor }
      });
      await onReload();
      setMessage({ kind: "yellow", text: "Profile updated." });
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : "Profile update failed." });
    }
  }

  return (
    <SectionBox title="Edit Channel Profile">
      {cropRequest ? (
        <ImageCropModal
          request={cropRequest}
          onCancel={closeCrop}
          onConfirm={finishCrop}
        />
      ) : null}
      {message ? <Notice kind={message.kind}>{message.text}</Notice> : null}
      <form className="form-grid" onSubmit={submit}>
        <div className="form-row">
          <label htmlFor="profile-avatar">Profile Picture</label>
          <div>
            <OldInput
              id="profile-avatar"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={(event) => {
                beginCrop("avatar", event.currentTarget.files?.[0] ?? null);
                event.currentTarget.value = "";
              }}
            />
            <div className="meta">JPG, PNG, WebP, or GIF. Max 5MB.</div>
          </div>
        </div>
        <div className="form-row">
          <label htmlFor="profile-banner">Channel Banner</label>
          <div>
            <OldInput
              id="profile-banner"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={(event) => {
                beginCrop("banner", event.currentTarget.files?.[0] ?? null);
                event.currentTarget.value = "";
              }}
            />
            <div className="meta">Wide images work best. Max 10MB.</div>
          </div>
        </div>
        <div className="form-row"><label htmlFor="profile-email">Email</label><OldInput id="profile-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></div>
        <div className="form-row"><label htmlFor="profile-description">Channel Description</label><OldTextarea id="profile-description" value={description} onChange={(event) => setDescription(event.target.value)} /></div>
        <div className="form-row"><label htmlFor="profile-bg">Background</label><OldInput id="profile-bg" type="color" value={backgroundColor} onChange={(event) => setBackgroundColor(event.target.value)} /></div>
        <div className="form-row"><label htmlFor="profile-text">Text</label><OldInput id="profile-text" type="color" value={textColor} onChange={(event) => setTextColor(event.target.value)} /></div>
        <div className="form-row"><label htmlFor="profile-link">Links</label><OldInput id="profile-link" type="color" value={linkColor} onChange={(event) => setLinkColor(event.target.value)} /></div>
        <div className="form-actions"><OldButton type="submit">Save Profile</OldButton></div>
      </form>
    </SectionBox>
  );
}

function AccountVideos() {
  const [videos, setVideos] = useState<VideoSummary[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { title: string; category: string }>>({});

  async function load() {
    setLoading(true);
    try {
      const response = await api.account.videos();
      setVideos(response.items);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load().catch((err) => setMessage(err instanceof Error ? err.message : "Videos failed to load."));
  }, []);

  function startEdit(video: VideoSummary) {
    setMessage("");
    setEditingId(video.id);
    setDrafts((current) => ({
      ...current,
      [video.id]: { title: video.title, category: video.category }
    }));
  }

  function updateDraft(video: VideoSummary, field: "title" | "category", value: string) {
    setDrafts((current) => ({
      ...current,
      [video.id]: {
        title: current[video.id]?.title ?? video.title,
        category: current[video.id]?.category ?? video.category,
        [field]: value
      }
    }));
  }

  async function save(video: VideoSummary) {
    setMessage("");
    const draft = drafts[video.id] ?? { title: video.title, category: video.category };
    try {
      await api.videos.update(video.id, { title: draft.title.trim(), category: draft.category.trim() || "General" });
      await load();
      setMessage("Video updated.");
      setEditingId(null);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Video update failed.");
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Remove this video?")) return;
    setMessage("");
    try {
      await api.videos.remove(id);
      await load();
      setMessage("Video removed.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Video removal failed.");
    }
  }

  async function replace(id: string, file: File | null) {
    if (!file) return;
    setMessage("Uploading replacement file...");
    try {
      await api.videos.upload(id, file);
      await load();
      setMessage("Replacement uploaded. Processing has started.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Replacement upload failed.");
    }
  }

  return (
    <SectionBox title="My Videos" action={<Link to="/upload">Upload New Video</Link>}>
      {message ? <Notice kind={message.includes("failed") ? "error" : "yellow"}>{message}</Notice> : null}
      {loading ? <LoadingBox label="Loading your videos..." /> : null}
      {!loading && videos.length ? (
        <div className="manage-video-list">
          {videos.map((video) => {
            const isEditing = editingId === video.id;
            const draft = drafts[video.id] ?? { title: video.title, category: video.category };
            return (
              <div className="manage-video-row" key={video.id}>
                <Link className="manage-video-thumb" to={`/watch/${video.id}`}>
                  {video.thumbnailUrl ? <img src={video.thumbnailUrl} alt="" /> : <span>OpenTube</span>}
                </Link>
                <div className="manage-video-main">
                  {isEditing ? (
                    <div className="manage-edit-fields">
                      <OldInput value={draft.title} onChange={(event) => updateDraft(video, "title", event.target.value)} />
                      <OldInput value={draft.category} onChange={(event) => updateDraft(video, "category", event.target.value)} />
                    </div>
                  ) : (
                    <>
                      <Link className="manage-video-title" to={`/watch/${video.id}`}>{video.title}</Link>
                      <div className="meta">
                        Status: <span className={`status-pill status-${video.status.toLowerCase()}`}>{video.status}</span>
                        {" | "}Views: {video.views.toLocaleString()}
                        {" | "}Rating: {video.averageRating.toFixed(1)}
                        {" | "}Category: {video.category}
                        {" | "}Added: {formatDate(video.createdAt)}
                      </div>
                    </>
                  )}
                  <label className="manage-replace">
                    Replacement:
                    <OldInput type="file" accept="video/*" onChange={(event) => void replace(video.id, event.currentTarget.files?.[0] ?? null)} />
                  </label>
                </div>
                <div className="manage-video-actions">
                  {isEditing ? (
                    <>
                      <OldButton onClick={() => void save(video)}>Save</OldButton>
                      <OldButton onClick={() => setEditingId(null)}>Cancel</OldButton>
                    </>
                  ) : (
                    <OldButton onClick={() => startEdit(video)}>Edit</OldButton>
                  )}
                  <OldButton onClick={() => void remove(video.id)}>Delete</OldButton>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
      {!loading && !videos.length ? <div className="empty-state">No uploaded videos yet.</div> : null}
    </SectionBox>
  );
}

function AccountFavorites() {
  const [videos, setVideos] = useState<VideoSummary[]>([]);
  useEffect(() => {
    void api.account.favorites().then((response) => setVideos(response.items));
  }, []);
  return (
    <SectionBox title="Favorite Videos">
      <VideoGrid videos={videos} />
    </SectionBox>
  );
}

function AccountSubscriptions() {
  const [channels, setChannels] = useState<PublicUser[]>([]);
  useEffect(() => {
    void api.account.subscriptions().then((response) => setChannels(response.items));
  }, []);
  return (
    <SectionBox title="Subscriptions">
      <AdminTable
        headers={["Channel", "Joined", "Videos", "Subscribers"]}
        rows={channels.map((channel) => [
          <><Link to={`/user/${channel.username}`}>{channel.username}</Link>{channel.isVerified ? <VerifiedBadge /> : null}</>,
          formatDate(channel.createdAt),
          channel.stats?.videosUploaded ?? 0,
          channel.stats?.subscribers ?? 0
        ])}
      />
      {!channels.length ? <div className="empty-state">No subscriptions yet.</div> : null}
    </SectionBox>
  );
}

export function AccountPage() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [profile, setProfile] = useState<{ user: PublicUser; email: string } | null>(null);
  const [error, setError] = useState("");

  async function load() {
    setError("");
    try {
      setProfile(await api.account.profile());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Account failed to load.");
    }
  }

  useEffect(() => {
    if (user) void load();
  }, [user?.id]);

  if (loading) return <LoadingBox />;
  if (!user) return <Navigate to="/login" replace />;
  if (error) return <Notice kind="error">{error}</Notice>;
  if (!profile) return <LoadingBox label="Loading account..." />;

  let content = <AccountOverview profile={profile} />;
  if (location.pathname.endsWith("/profile")) content = <ProfileEditor profile={profile} onReload={load} />;
  if (location.pathname.endsWith("/videos")) content = <AccountVideos />;
  if (location.pathname.endsWith("/favorites")) content = <AccountFavorites />;
  if (location.pathname.endsWith("/subscriptions")) content = <AccountSubscriptions />;

  return (
    <>
      <AccountNav />
      {content}
    </>
  );
}
