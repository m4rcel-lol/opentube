import { Route, Routes, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { AuthProvider, useAuth } from "./api/auth.js";
import { api, type PublicSettings } from "./api/client.js";
import { AccountPage } from "./pages/AccountPages.js";
import { AdminPage } from "./pages/AdminPages.js";
import { LoginPage, RegisterPage, UploadPage } from "./pages/AuthUploadPages.js";
import { CreditsPage } from "./pages/CreditsPage.js";
import {
  ChannelsPage,
  ChannelPage,
  CommunityPage,
  GroupsPage,
  HomePage,
  NotFoundPage,
  SearchPage,
  VideosPage
} from "./pages/PublicPages.js";
import { EmbedPage, WatchPage } from "./pages/WatchPages.js";
import { HeaderNav } from "./components/ui.js";

function SiteAnnouncement({ settings }: { settings: PublicSettings | null }) {
  if (!settings?.announcementEnabled || !settings.announcementText.trim()) return null;
  const content = settings.announcementLink.trim() ? (
    <a href={settings.announcementLink}>{settings.announcementText}</a>
  ) : settings.announcementText;
  return (
    <div className={`site-announcement site-announcement-${settings.announcementKind.toLowerCase()}`}>
      {content}
    </div>
  );
}

function MaintenancePage({ settings }: { settings: PublicSettings | null }) {
  return (
    <main className="main-content">
      <section className="section-box maintenance-box">
        <div className="section-title">Site Maintenance</div>
        <div className="section-body">
          <h1>{settings?.siteName ?? "OpenTube"} is in maintenance mode</h1>
          <p>{settings?.maintenanceMessage || "OpenTube is temporarily down for maintenance."}</p>
          <p className="meta">Admins can still log in and use the administration control panel.</p>
          <a href="/login">Admin Login</a>
        </div>
      </section>
    </main>
  );
}

function SuspendedAccountPage({ settings }: { settings: PublicSettings | null }) {
  const { logout } = useAuth();

  async function hardLogout() {
    await logout();
    window.location.assign("/login");
  }

  return (
    <div className="page-shell suspended-shell">
      <main className="main-content">
        <section className="section-box suspended-box">
          <div className="section-title">Account Suspended</div>
          <div className="section-body">
            <img className="suspended-logo" src="/opentube-logo.png" alt={settings?.siteName ?? "OpenTube"} />
            <h1>Your account has been suspended.</h1>
            <p>This account has been banned for breaking Terms of Service of {settings?.siteName ?? "OpenTube"}.</p>
            <OldSuspendedButton onClick={() => void hardLogout()} />
          </div>
        </section>
      </main>
    </div>
  );
}

function OldSuspendedButton({ onClick }: { onClick: () => void }) {
  return <button type="button" className="old-button" onClick={onClick}>Log Out</button>;
}

function RoutedApp() {
  const location = useLocation();
  const { user, loading } = useAuth();
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const isEmbed = location.pathname.startsWith("/embed/");

  useEffect(() => {
    let active = true;
    async function loadSettings() {
      try {
        const response = await api.settings.public();
        if (active) setSettings(response.settings);
      } catch {
        if (active) setSettings(null);
      }
    }
    void loadSettings();
    const interval = window.setInterval(() => void loadSettings(), 5000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    function hardNavigate(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      const target = anchor.getAttribute("target");
      if (!href || href.startsWith("#") || target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(href, window.location.href);
      if (url.origin !== window.location.origin) return;
      event.preventDefault();
      window.location.assign(url.pathname + url.search + url.hash);
    }
    document.addEventListener("click", hardNavigate, true);
    return () => document.removeEventListener("click", hardNavigate, true);
  }, []);

  if (isEmbed) {
    return (
      <Routes>
        <Route path="/embed/:videoId" element={<EmbedPage />} />
        <Route path="*" element={<EmbedPage />} />
      </Routes>
    );
  }

  const maintenanceBlocksPage =
    settings?.maintenanceEnabled &&
    !loading &&
    user?.role !== "ADMIN" &&
    location.pathname !== "/login";

  if (!isEmbed && user?.isBanned) {
    return <SuspendedAccountPage settings={settings} />;
  }

  return (
    <div className="page-shell">
      <HeaderNav settings={settings} />
      <SiteAnnouncement settings={settings} />
      {settings?.maintenanceEnabled && user?.role === "ADMIN" ? (
        <div className="notice notice-error admin-maintenance-notice">Maintenance mode is active for non-admin visitors.</div>
      ) : null}
      {maintenanceBlocksPage ? (
        <MaintenancePage settings={settings} />
      ) : (
        <main className="main-content">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/videos" element={<VideosPage />} />
            <Route path="/videos/recent" element={<VideosPage />} />
            <Route path="/videos/most-viewed" element={<VideosPage />} />
            <Route path="/videos/top-rated" element={<VideosPage />} />
            <Route path="/watch/:videoId" element={<WatchPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/channels" element={<ChannelsPage />} />
            <Route path="/user/:username" element={<ChannelPage />} />
            <Route path="/groups" element={<GroupsPage />} />
            <Route path="/community" element={<CommunityPage />} />
            <Route path="/credits" element={<CreditsPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/upload" element={<UploadPage />} />
            <Route path="/account" element={<AccountPage />} />
            <Route path="/account/profile" element={<AccountPage />} />
            <Route path="/account/videos" element={<AccountPage />} />
            <Route path="/account/favorites" element={<AccountPage />} />
            <Route path="/account/subscriptions" element={<AccountPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/admin/videos" element={<AdminPage />} />
            <Route path="/admin/users" element={<AdminPage />} />
            <Route path="/admin/comments" element={<AdminPage />} />
            <Route path="/admin/reports" element={<AdminPage />} />
            <Route path="/admin/settings" element={<AdminPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </main>
      )}
      <footer className="site-footer">
        <a href="/credits">Credits & Thanks</a>
        {" | "}
        Independent OpenTube revival. Not affiliated with YouTube or Google.
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <RoutedApp />
    </AuthProvider>
  );
}
