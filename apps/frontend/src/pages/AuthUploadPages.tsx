import { Link, Navigate } from "react-router-dom";
import { useState } from "react";
import type * as React from "react";
import { useAuth } from "../api/auth.js";
import { api } from "../api/client.js";
import { LoadingBox, Notice, OldButton, OldInput, OldTextarea, SectionBox } from "../components/ui.js";

export function LoginPage() {
  const { user, login, loading } = useAuth();
  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  if (loading) return <LoadingBox />;
  if (user) return <Navigate to="/account" replace />;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await login(usernameOrEmail, password);
      window.location.assign("/account");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    }
  }

  return (
    <SectionBox title="Login">
      {error ? <Notice kind="error">{error}</Notice> : null}
      <form className="form-grid" onSubmit={submit}>
        <div className="form-row">
          <label htmlFor="login-name">Username or Email</label>
          <OldInput id="login-name" value={usernameOrEmail} onChange={(event) => setUsernameOrEmail(event.target.value)} required />
        </div>
        <div className="form-row">
          <label htmlFor="login-password">Password</label>
          <OldInput id="login-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        </div>
        <div className="form-actions">
          <OldButton type="submit">Login</OldButton>{" "}
          <Link to="/register">Register for an account</Link>
        </div>
      </form>
    </SectionBox>
  );
}

export function RegisterPage() {
  const { user, register, loading } = useAuth();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  if (loading) return <LoadingBox />;
  if (user) return <Navigate to="/account" replace />;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await register(username, email, password);
      window.location.assign("/account");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed.");
    }
  }

  return (
    <SectionBox title="Register">
      {error ? <Notice kind="error">{error}</Notice> : null}
      <form className="form-grid" onSubmit={submit}>
        <div className="form-row">
          <label htmlFor="register-username">Username</label>
          <OldInput id="register-username" value={username} onChange={(event) => setUsername(event.target.value)} required />
        </div>
        <div className="form-row">
          <label htmlFor="register-email">Email</label>
          <OldInput id="register-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </div>
        <div className="form-row">
          <label htmlFor="register-password">Password</label>
          <OldInput
            id="register-password"
            type="password"
            minLength={12}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </div>
        <div className="form-actions">
          <OldButton type="submit">Create Account</OldButton>
        </div>
      </form>
    </SectionBox>
  );
}

export function UploadPage() {
  const { user, loading } = useAuth();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [category, setCategory] = useState("People");
  const [visibility, setVisibility] = useState("PUBLIC");
  const [allowEmbedding, setAllowEmbedding] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  if (loading) return <LoadingBox />;
  if (!user) return <Navigate to="/login" replace />;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setStatus("Creating video record...");
    if (!file) {
      setError("Choose a video file to upload.");
      setStatus("");
      return;
    }
    try {
      const created = await api.videos.create({
        title,
        description,
        tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        category,
        visibility,
        allowEmbedding
      });
      setStatus("Uploading video file...");
      const uploaded = await api.videos.upload(created.video.id, file);
      setStatus("Upload complete. Processing has started.");
      window.location.assign(`/watch/${uploaded.video.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
      setStatus("");
    }
  }

  return (
    <SectionBox title="Upload Video">
      {error ? <Notice kind="error">{error}</Notice> : null}
      {status ? <Notice kind="blue">{status}</Notice> : null}
      <form className="form-grid" onSubmit={submit}>
        <div className="form-row">
          <label htmlFor="upload-title">Title</label>
          <OldInput id="upload-title" maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} required />
        </div>
        <div className="form-row">
          <label htmlFor="upload-description">Description</label>
          <OldTextarea id="upload-description" maxLength={5000} value={description} onChange={(event) => setDescription(event.target.value)} />
        </div>
        <div className="form-row">
          <label htmlFor="upload-tags">Tags</label>
          <OldInput id="upload-tags" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="music, home movie, archive" />
        </div>
        <div className="form-row">
          <label htmlFor="upload-category">Category</label>
          <select id="upload-category" value={category} onChange={(event) => setCategory(event.target.value)}>
            {["People", "Music", "Comedy", "Education", "Entertainment", "Film", "Gaming", "News", "Sports", "Travel"].map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <label htmlFor="upload-visibility">Visibility</label>
          <select id="upload-visibility" value={visibility} onChange={(event) => setVisibility(event.target.value)}>
            <option value="PUBLIC">Public</option>
            <option value="UNLISTED">Unlisted</option>
            <option value="PRIVATE">Private</option>
          </select>
        </div>
        <div className="form-row">
          <label htmlFor="upload-file">Video File</label>
          <OldInput id="upload-file" type="file" accept="video/mp4,video/quicktime,video/x-msvideo,video/webm,video/x-matroska" onChange={(event) => setFile(event.target.files?.[0] ?? null)} required />
        </div>
        <div className="form-row">
          <label htmlFor="upload-embed">Embedding</label>
          <label>
            <input id="upload-embed" type="checkbox" checked={allowEmbedding} onChange={(event) => setAllowEmbedding(event.target.checked)} /> Allow embedding
          </label>
        </div>
        <div className="form-actions">
          <OldButton type="submit" disabled={Boolean(status)}>Upload Video</OldButton>
        </div>
      </form>
    </SectionBox>
  );
}
