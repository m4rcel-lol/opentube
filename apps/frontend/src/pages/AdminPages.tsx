import { Link, Navigate, NavLink, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import type * as React from "react";
import { api, type AdminCommentDto, type AdminStats, type AdminUser, type AdminVideo, type PublicSettings, type ReportDto } from "../api/client.js";
import { useAuth } from "../api/auth.js";
import { AdminTable, LoadingBox, Notice, OldButton, OldInput, OldTextarea, SectionBox, VerifiedBadge, formatDate } from "../components/ui.js";

function AdminNav({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div className="notice notice-blue">
      <NavLink to="/admin">Dashboard</NavLink>
      {" | "}
      {isAdmin ? <><NavLink to="/admin/videos">Videos</NavLink>{" | "}<NavLink to="/admin/users">Users</NavLink>{" | "}<NavLink to="/admin/settings">Settings</NavLink>{" | "}</> : null}
      <NavLink to="/admin/comments">Comments</NavLink>
      {" | "}
      <NavLink to="/admin/reports">Reports</NavLink>
    </div>
  );
}

function AdminDashboard({ stats }: { stats: AdminStats }) {
  return (
    <>
      <SectionBox title="Admin Dashboard" action={<Link to="/admin/settings">Site Settings</Link>}>
        <div className="admin-stat-grid">
          <div className="admin-stat"><strong>{stats.users}</strong><span>Users</span></div>
          <div className="admin-stat"><strong>{stats.videos}</strong><span>Videos</span></div>
          <div className="admin-stat"><strong>{stats.readyVideos}</strong><span>Ready Videos</span></div>
          <div className="admin-stat"><strong>{stats.openReports}</strong><span>Open Reports</span></div>
          <div className="admin-stat"><strong>{stats.comments + stats.channelComments}</strong><span>Comments</span></div>
          <div className="admin-stat"><strong>{stats.views}</strong><span>View Events</span></div>
        </div>
      </SectionBox>
      <SectionBox title="Moderation Snapshot">
        <AdminTable
          headers={["Area", "Needs Attention", "Control"]}
          rows={[
            ["Users", `${stats.bannedUsers} banned`, <Link to="/admin/users">Manage users</Link>],
            ["Videos", `${stats.failedVideos} failed, ${stats.removedVideos} removed`, <Link to="/admin/videos">Manage videos</Link>],
            ["Reports", `${stats.openReports} open`, <Link to="/admin/reports">Review reports</Link>],
            ["Comments", `${stats.comments} video, ${stats.channelComments} channel`, <Link to="/admin/comments">Moderate comments</Link>]
          ]}
        />
      </SectionBox>
    </>
  );
}

function AdminVideos() {
  const [videos, setVideos] = useState<AdminVideo[]>([]);
  const [message, setMessage] = useState("");

  async function load() {
    const response = await api.admin.videos();
    setVideos(response.items);
  }

  useEffect(() => {
    void load().catch((err) => setMessage(err instanceof Error ? err.message : "Videos failed to load."));
  }, []);

  async function patch(id: string, body: unknown) {
    try {
      await api.admin.updateVideo(id, body);
      await load();
      setMessage("Video updated.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Video update failed.");
    }
  }

  return (
    <SectionBox title="Admin Videos">
      {message ? <Notice kind={message.includes("updated") ? "yellow" : "error"}>{message}</Notice> : null}
      <AdminTable
        headers={["Video", "Owner", "Status", "Visibility", "Embedding", "Views", "Actions"]}
        rows={videos.map((video) => [
          <>
            <Link to={`/watch/${video.id}`}>{video.title}</Link>
            <div><OldInput defaultValue={video.title} onBlur={(event) => void patch(video.id, { title: event.currentTarget.value })} /></div>
          </>,
          <Link to={`/user/${video.ownerUsername}`}>{video.ownerUsername}</Link>,
          <select value={video.status} onChange={(event) => void patch(video.id, { status: event.target.value })}>
            {["UPLOADING", "PROCESSING", "READY", "FAILED", "REMOVED"].map((status) => <option key={status} value={status}>{status}</option>)}
          </select>,
          <select value={video.visibility} onChange={(event) => void patch(video.id, { visibility: event.target.value })}>
            {["PUBLIC", "UNLISTED", "PRIVATE"].map((visibility) => <option key={visibility} value={visibility}>{visibility}</option>)}
          </select>,
          <label><input type="checkbox" checked={video.allowEmbedding} onChange={(event) => void patch(video.id, { allowEmbedding: event.target.checked })} /> Allowed</label>,
          video.views.toLocaleString(),
          <OldButton onClick={() => void patch(video.id, { status: video.status === "REMOVED" ? "READY" : "REMOVED" })}>{video.status === "REMOVED" ? "Restore" : "Remove"}</OldButton>
        ])}
      />
    </SectionBox>
  );
}

function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [message, setMessage] = useState("");

  async function load() {
    const response = await api.admin.users();
    setUsers(response.items as AdminUser[]);
  }

  useEffect(() => {
    void load().catch((err) => setMessage(err instanceof Error ? err.message : "Users failed to load."));
  }, []);

  async function patch(id: string, body: unknown) {
    try {
      await api.admin.updateUser(id, body);
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "User update failed.");
    }
  }

  return (
    <SectionBox title="Admin Users">
      {message ? <Notice kind="error">{message}</Notice> : null}
      <AdminTable
        headers={["User", "Email", "Role", "Verified", "Banned", "Stats", "Joined", "Actions"]}
        rows={users.map((user) => [
          <>
            <Link to={`/user/${user.username}`}>{user.username}</Link>
            {user.isVerified ? <VerifiedBadge /> : null}
            {user.role === "ADMIN" ? <span className="role-badge role-admin">Admin</span> : null}
            {user.role === "MODERATOR" ? <span className="role-badge role-moderator">Moderator</span> : null}
          </>,
          user.email,
          <select value={user.role} onChange={(event) => void patch(user.id, { role: event.target.value })}>
            {["USER", "MODERATOR", "ADMIN"].map((role) => <option key={role} value={role}>{role}</option>)}
          </select>,
          user.isVerified ? "Yes" : "No",
          user.isBanned ? "Yes" : "No",
          `${user.stats?.videosUploaded ?? 0} videos, ${user.stats?.subscribers ?? 0} subs, ${(user.stats?.totalViews ?? 0).toLocaleString()} views`,
          formatDate(user.createdAt),
          <div className="admin-action-stack">
            <OldButton onClick={() => void patch(user.id, { isVerified: !user.isVerified })}>{user.isVerified ? "Unverify" : "Verify"}</OldButton>
            <OldButton onClick={() => void patch(user.id, { isBanned: !user.isBanned })}>{user.isBanned ? "Unban" : "Ban"}</OldButton>
          </div>
        ])}
      />
    </SectionBox>
  );
}

function AdminReports() {
  const [reports, setReports] = useState<ReportDto[]>([]);
  const [message, setMessage] = useState("");

  async function load() {
    const response = await api.admin.reports();
    setReports(response.items);
  }

  useEffect(() => {
    void load().catch((err) => setMessage(err instanceof Error ? err.message : "Reports failed to load."));
  }, []);

  async function update(id: string, status: "OPEN" | "REVIEWED" | "DISMISSED") {
    try {
      await api.admin.updateReport(id, status);
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Report update failed.");
    }
  }

  return (
    <SectionBox title="Reports">
      {message ? <Notice kind="error">{message}</Notice> : null}
      <AdminTable
        headers={["Reporter", "Target", "Reason", "Status", "Created", "Actions"]}
        rows={reports.map((report) => [
          <Link to={`/user/${report.reporter.username}`}>{report.reporter.username}</Link>,
          `${report.targetType} ${report.targetId}`,
          report.reason,
          report.status,
          formatDate(report.createdAt),
          <select value={report.status} onChange={(event) => void update(report.id, event.target.value as ReportDto["status"])}>
            {["OPEN", "REVIEWED", "DISMISSED"].map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        ])}
      />
    </SectionBox>
  );
}

function AdminComments() {
  const [comments, setComments] = useState<AdminCommentDto[]>([]);
  const [message, setMessage] = useState("");

  async function load() {
    const response = await api.admin.comments();
    setComments(response.items);
  }

  useEffect(() => {
    void load().catch((err) => setMessage(err instanceof Error ? err.message : "Comments failed to load."));
  }, []);

  async function remove(comment: AdminCommentDto) {
    try {
      if (comment.targetType === "CHANNEL") await api.admin.deleteChannelComment(comment.id);
      else await api.admin.deleteComment(comment.id);
      await load();
      setMessage("Comment removed.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Comment removal failed.");
    }
  }

  return (
    <SectionBox title="Comments">
      {message ? <Notice kind={message.includes("removed") ? "yellow" : "error"}>{message}</Notice> : null}
      <AdminTable
        headers={["Author", "Target", "Body", "Status", "Created", "Actions"]}
        rows={comments.map((comment) => [
          <Link to={`/user/${comment.username}`}>{comment.username}</Link>,
          <Link to={comment.targetPath}>{comment.targetType}: {comment.targetLabel}</Link>,
          comment.body,
          comment.isRemoved ? "Removed" : "Visible",
          formatDate(comment.createdAt),
          <OldButton disabled={comment.isRemoved} onClick={() => void remove(comment)}>Remove</OldButton>
        ])}
      />
      {!comments.length ? <div className="empty-state">No comments found.</div> : null}
    </SectionBox>
  );
}

function AdminSettings() {
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void api.admin.settings().then((response) => setSettings(response.settings)).catch((err) => setMessage(err instanceof Error ? err.message : "Settings failed to load."));
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!settings) return;
    try {
      const response = await api.admin.updateSettings(settings);
      setSettings(response.settings);
      setMessage("Settings saved.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Settings update failed.");
    }
  }

  if (!settings) return <LoadingBox label="Loading settings..." />;

  return (
    <SectionBox title="Site Settings">
      {message ? <Notice kind={message.includes("saved") ? "yellow" : "error"}>{message}</Notice> : null}
      <form className="form-grid" onSubmit={submit}>
        <div className="form-row"><label htmlFor="site-name">Site Name</label><OldInput id="site-name" value={settings.siteName} onChange={(event) => setSettings({ ...settings, siteName: event.target.value })} /></div>
        <div className="form-row"><label htmlFor="site-tagline">Tagline</label><OldInput id="site-tagline" value={settings.tagline} onChange={(event) => setSettings({ ...settings, tagline: event.target.value })} /></div>
        <div className="form-row"><label htmlFor="site-announcement-enabled">Website Banner</label><label><input id="site-announcement-enabled" type="checkbox" checked={settings.announcementEnabled} onChange={(event) => setSettings({ ...settings, announcementEnabled: event.target.checked })} /> Show site-wide banner</label></div>
        <div className="form-row"><label htmlFor="site-announcement-text">Banner Text</label><OldTextarea id="site-announcement-text" value={settings.announcementText} onChange={(event) => setSettings({ ...settings, announcementText: event.target.value })} /></div>
        <div className="form-row"><label htmlFor="site-announcement-link">Banner Link</label><OldInput id="site-announcement-link" value={settings.announcementLink} placeholder="/watch/..." onChange={(event) => setSettings({ ...settings, announcementLink: event.target.value })} /></div>
        <div className="form-row">
          <label htmlFor="site-announcement-kind">Banner Style</label>
          <select id="site-announcement-kind" value={settings.announcementKind} onChange={(event) => setSettings({ ...settings, announcementKind: event.target.value as PublicSettings["announcementKind"] })}>
            <option value="INFO">Info</option>
            <option value="WARNING">Warning</option>
          </select>
        </div>
        <div className="form-row"><label htmlFor="site-maintenance-enabled">Maintenance Mode</label><label><input id="site-maintenance-enabled" type="checkbox" checked={settings.maintenanceEnabled} onChange={(event) => setSettings({ ...settings, maintenanceEnabled: event.target.checked })} /> Lock public site for non-admins</label></div>
        <div className="form-row"><label htmlFor="site-maintenance-message">Maintenance Message</label><OldTextarea id="site-maintenance-message" value={settings.maintenanceMessage} onChange={(event) => setSettings({ ...settings, maintenanceMessage: event.target.value })} /></div>
        <div className="form-row"><label htmlFor="site-max">Max Upload Bytes</label><OldInput id="site-max" type="number" value={settings.maxUploadBytes} onChange={(event) => setSettings({ ...settings, maxUploadBytes: Number(event.target.value) })} /></div>
        <div className="form-row"><label htmlFor="site-embed">Embedding</label><label><input id="site-embed" type="checkbox" checked={settings.embeddingEnabled} onChange={(event) => setSettings({ ...settings, embeddingEnabled: event.target.checked })} /> Enabled</label></div>
        <div className="form-row"><label htmlFor="site-register">Registration</label><label><input id="site-register" type="checkbox" checked={settings.allowRegistration} onChange={(event) => setSettings({ ...settings, allowRegistration: event.target.checked })} /> Enabled</label></div>
        <div className="form-row">
          <label>Banner Preview</label>
          <div className={`site-announcement site-announcement-${settings.announcementKind.toLowerCase()}`}>
            {settings.announcementText || "No banner text set."}
          </div>
        </div>
        <div className="form-actions"><OldButton type="submit">Save Settings</OldButton></div>
      </form>
    </SectionBox>
  );
}

export function AdminPage() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user?.role === "MODERATOR" || user?.role === "ADMIN") {
      void api.admin.stats().then(setStats).catch((err) => setError(err instanceof Error ? err.message : "Admin stats failed to load."));
    }
  }, [user?.role]);

  if (loading) return <LoadingBox />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "MODERATOR" && user.role !== "ADMIN") return <Navigate to="/" replace />;
  if (error) return <Notice kind="error">{error}</Notice>;
  if (!stats) return <LoadingBox label="Loading admin..." />;

  const isAdmin = user.role === "ADMIN";
  let content = <AdminDashboard stats={stats} />;
  if (location.pathname.endsWith("/reports")) content = <AdminReports />;
  if (location.pathname.endsWith("/comments")) content = <AdminComments />;
  if (isAdmin && location.pathname.endsWith("/videos")) content = <AdminVideos />;
  if (isAdmin && location.pathname.endsWith("/users")) content = <AdminUsers />;
  if (isAdmin && location.pathname.endsWith("/settings")) content = <AdminSettings />;
  if (!isAdmin && !location.pathname.endsWith("/reports") && !location.pathname.endsWith("/comments") && location.pathname !== "/admin") {
    content = <Navigate to="/admin" replace />;
  }

  return (
    <>
      <AdminNav isAdmin={isAdmin} />
      {content}
    </>
  );
}
