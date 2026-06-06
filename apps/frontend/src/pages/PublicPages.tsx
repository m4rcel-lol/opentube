import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import type * as React from "react";
import type { Paginated, PublicUser, VideoSummary } from "@opentube/shared";
import { api, type ChannelCommentDto } from "../api/client.js";
import { useAuth } from "../api/auth.js";
import {
  CategoryLinks,
  LoadingBox,
  Notice,
  OldButton,
  OldTextarea,
  Pagination,
  ProfileBox,
  SectionBox,
  SidebarBox,
  VerifiedBadge,
  VideoGrid,
  avatarSrc,
  formatDate
} from "../components/ui.js";
import { useAsync } from "./hooks.js";

const defaultPage: Paginated<VideoSummary> = { items: [], page: 1, pageSize: 20, total: 0, totalPages: 1 };

function videoQuery(sort: string, page: number, category?: string | null) {
  const params = new URLSearchParams({ sort, page: String(page), pageSize: "20" });
  if (category) params.set("category", category);
  return `?${params.toString()}`;
}

export function HomePage() {
  const { data, loading, error } = useAsync(async () => {
    const [recent, most, top] = await Promise.all([
      api.videos.list("?sort=recent&page=1&pageSize=9"),
      api.videos.list("?sort=most-viewed&page=1&pageSize=8"),
      api.videos.list("?sort=top-rated&page=1&pageSize=8")
    ]);
    return { recent, most, top };
  }, []);

  if (loading) return <LoadingBox />;
  if (error) return <Notice kind="error">{error}</Notice>;

  const recent = data?.recent ?? defaultPage;
  const most = data?.most ?? defaultPage;
  const top = data?.top ?? defaultPage;

  return (
    <div className="two-column">
      <div>
        <SectionBox title="Featured Videos" action={<Link to="/videos/most-viewed">See More Featured</Link>}>
          <VideoGrid videos={most.items.length ? most.items.slice(0, 5) : recent.items.slice(0, 5)} fixedPreviews />
        </SectionBox>
        <SectionBox title="Recently Uploaded" action={<Link to="/videos/recent">More Recent Videos</Link>}>
          <VideoGrid videos={recent.items} />
        </SectionBox>
      </div>
      <div>
        <SidebarBox title="Most Viewed">
          <VideoGrid videos={most.items.slice(0, 4)} />
        </SidebarBox>
        <SidebarBox title="Top Rated">
          <VideoGrid videos={top.items.slice(0, 4)} />
        </SidebarBox>
        <SidebarBox title="Categories">
          <CategoryLinks />
        </SidebarBox>
        <SidebarBox title="Community">
          <ul className="link-list">
            <li><Link to="/channels">Browse Channels</Link></li>
            <li><Link to="/groups">Browse Groups</Link></li>
            <li><Link to="/community">Community Activity</Link></li>
          </ul>
        </SidebarBox>
      </div>
    </div>
  );
}

export function VideosPage() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const category = searchParams.get("category");
  const sort = location.pathname.endsWith("/most-viewed")
    ? "most-viewed"
    : location.pathname.endsWith("/top-rated")
      ? "top-rated"
      : "recent";
  const { data, loading, error } = useAsync(() => api.videos.list(videoQuery(sort, page, category)), [sort, page, category]);

  useEffect(() => setPage(1), [sort, category]);

  return (
    <div className="two-column">
      <div>
        <SectionBox
          title={category ? `${category} Videos` : sort === "most-viewed" ? "Most Viewed Videos" : sort === "top-rated" ? "Top Rated Videos" : "Recent Videos"}
          action={
            <>
              <Link to="/videos/recent">Recent</Link> | <Link to="/videos/most-viewed">Most Viewed</Link> | <Link to="/videos/top-rated">Top Rated</Link>
            </>
          }
        >
          {loading ? <LoadingBox /> : null}
          {error ? <Notice kind="error">{error}</Notice> : null}
          {data ? (
            <>
              <VideoGrid videos={data.items} />
              <Pagination page={data.page} totalPages={data.totalPages} onPage={setPage} />
            </>
          ) : null}
        </SectionBox>
      </div>
      <div>
        <SidebarBox title="Browse Categories">
          <CategoryLinks />
        </SidebarBox>
      </div>
    </div>
  );
}

export function SearchPage() {
  const [searchParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const q = searchParams.get("q") ?? "";
  const sort = searchParams.get("sort") ?? "recent";
  const { data, loading, error } = useAsync(() => {
    const params = new URLSearchParams({ q, sort, page: String(page), pageSize: "20" });
    return api.videos.search(`?${params.toString()}`);
  }, [q, sort, page]);

  function changeSort(nextSort: string) {
    const params = new URLSearchParams({ q, sort: nextSort });
    window.location.assign(`/search?${params.toString()}`);
  }

  return (
    <SectionBox
      title={`Search Results for "${q}"`}
      action={
        <>
          Sort:{" "}
          <button className="link-button" type="button" onClick={() => changeSort("recent")}>Recent</button>
          {" | "}
          <button className="link-button" type="button" onClick={() => changeSort("most-viewed")}>Most Viewed</button>
          {" | "}
          <button className="link-button" type="button" onClick={() => changeSort("top-rated")}>Top Rated</button>
        </>
      }
    >
      {loading ? <LoadingBox /> : null}
      {error ? <Notice kind="error">{error}</Notice> : null}
      {data ? (
        <>
          <VideoGrid videos={data.items} />
          <Pagination page={data.page} totalPages={data.totalPages} onPage={setPage} />
        </>
      ) : null}
    </SectionBox>
  );
}

export function ChannelsPage() {
  const [page, setPage] = useState(1);
  const { data, loading, error } = useAsync(() => api.users.channels(page), [page]);
  return (
    <SectionBox title="Channels">
      {loading ? <LoadingBox /> : null}
      {error ? <Notice kind="error">{error}</Notice> : null}
      {data ? (
        <>
          {data.items.length ? (
            <table className="data-table">
              <thead>
                <tr><th>Channel</th><th>Joined</th><th>Videos</th><th>Subscribers</th><th>Total Views</th></tr>
              </thead>
              <tbody>
                {data.items.map((user) => (
                  <tr key={user.id}>
                    <td><Link to={`/user/${user.username}`}>{user.username}</Link>{user.isVerified ? <VerifiedBadge /> : null}</td>
                    <td>{formatDate(user.createdAt)}</td>
                    <td>{user.stats?.videosUploaded ?? 0}</td>
                    <td>{user.stats?.subscribers ?? 0}</td>
                    <td>{(user.stats?.totalViews ?? 0).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty-state">No channels have been created yet. Register an account to start the first OpenTube channel.</div>
          )}
          <Pagination page={data.page} totalPages={data.totalPages} onPage={setPage} />
        </>
      ) : null}
    </SectionBox>
  );
}

function ChannelComments({
  username,
  owner,
  comments,
  onReload
}: {
  username: string;
  owner: PublicUser;
  comments: ChannelCommentDto[];
  onReload: () => Promise<void>;
}) {
  const { user } = useAuth();
  const [body, setBody] = useState("");
  const [error, setError] = useState("");

  async function postComment(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await api.users.comment(username, body);
      setBody("");
      await onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not post comment.");
    }
  }

  async function remove(id: string) {
    setError("");
    try {
      await api.users.deleteComment(id);
      await onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove comment.");
    }
  }

  return (
    <SectionBox title="Profile Comments">
      {error ? <Notice kind="error">{error}</Notice> : null}
      {user ? (
        <form className="form-grid" onSubmit={postComment}>
          <OldTextarea value={body} maxLength={2000} onChange={(event) => setBody(event.target.value)} required />
          <OldButton type="submit">Post Comment</OldButton>
        </form>
      ) : (
        <Notice kind="blue"><Link to="/login">Login</Link> to post a channel comment.</Notice>
      )}
      {comments.map((comment) => (
        <div className="comment" key={comment.id}>
          <div className="comment-row">
            <img className="comment-avatar" src={avatarSrc(comment.userAvatarPath)} alt="" />
            <div className="comment-content">
              <div className="comment-heading">
                <Link to={`/user/${comment.username}`}>{comment.username}</Link>
                {comment.userIsVerified ? <VerifiedBadge /> : null}
                <span className="meta">said on {formatDate(comment.createdAt)}</span>
              </div>
              <div>{comment.body}</div>
              {user && (user.id === comment.userId || user.id === owner.id || user.role === "MODERATOR" || user.role === "ADMIN") && !comment.isRemoved ? (
                <button className="link-button" type="button" onClick={() => void remove(comment.id)}>Remove</button>
              ) : null}
            </div>
          </div>
        </div>
      ))}
      {!comments.length ? <div className="empty-state">No profile comments yet.</div> : null}
    </SectionBox>
  );
}

export function ChannelPage() {
  const { username = "" } = useParams();
  const { user } = useAuth();
  const [error, setError] = useState("");
  const [channel, setChannel] = useState<{ user: PublicUser; isSubscribed: boolean } | null>(null);
  const [videos, setVideos] = useState<VideoSummary[]>([]);
  const [comments, setComments] = useState<ChannelCommentDto[]>([]);

  async function load() {
    setError("");
    try {
      const [channelResponse, videoResponse, commentResponse] = await Promise.all([
        api.users.get(username),
        api.users.videos(username),
        api.users.comments(username)
      ]);
      setChannel(channelResponse);
      setVideos(videoResponse.items);
      setComments(commentResponse.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Channel failed to load.");
    }
  }

  useEffect(() => {
    void load();
  }, [username]);

  async function toggleSubscribe() {
    if (!channel) return;
    if (channel.isSubscribed) await api.users.unsubscribe(channel.user.username);
    else await api.users.subscribe(channel.user.username);
    await load();
  }

  if (error) return <Notice kind="error">{error}</Notice>;
  if (!channel) return <LoadingBox />;

  if (channel.user.isBanned) {
    return (
      <div>
        <Notice kind="error">This user has been banned for breaking Terms of Service of OpenTube.</Notice>
        <ProfileBox user={channel.user} compact />
      </div>
    );
  }

  return (
    <div>
      <ProfileBox
        user={channel.user}
        isSubscribed={channel.isSubscribed}
        onToggle={user && user.id !== channel.user.id ? () => void toggleSubscribe() : undefined}
      />
      <div className="two-column">
        <div>
          <SectionBox title="Uploaded Videos">
            <VideoGrid videos={videos} />
          </SectionBox>
          <ChannelComments username={channel.user.username} owner={channel.user} comments={comments} onReload={load} />
        </div>
        <div>
          <SidebarBox title="Channel Profile">
            <p>{channel.user.channelDescription || "No channel description yet."}</p>
            <ul className="link-list">
              <li>Joined: {formatDate(channel.user.createdAt)}</li>
              <li>Videos Uploaded: {channel.user.stats?.videosUploaded ?? 0}</li>
              <li>Subscribers: {channel.user.stats?.subscribers ?? 0}</li>
              <li>Total Views: {(channel.user.stats?.totalViews ?? 0).toLocaleString()}</li>
            </ul>
          </SidebarBox>
        </div>
      </div>
    </div>
  );
}

export function GroupsPage() {
  const categories = ["Music", "Comedy", "Gaming", "Education", "Sports", "Travel", "News", "Film"];
  return (
    <div className="two-column">
      <SectionBox title="Groups">
        <Notice kind="blue">Groups organize OpenTube videos by shared interests and categories.</Notice>
        <table className="data-table">
          <thead><tr><th>Group</th><th>Description</th><th>Videos</th></tr></thead>
          <tbody>
            {categories.map((category) => (
              <tr key={category}>
                <td><strong>{category}</strong></td>
                <td className="meta">Open videos from this group category.</td>
                <td><Link to={`/videos?category=${encodeURIComponent(category)}`}>Browse {category}</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionBox>
      <SidebarBox title="All Categories">
        <CategoryLinks />
      </SidebarBox>
    </div>
  );
}

export function CommunityPage() {
  const { data, loading, error } = useAsync(async () => {
    const [channels, recent] = await Promise.all([api.users.channels(1), api.videos.list("?sort=recent&page=1&pageSize=8")]);
    return { channels, recent };
  }, []);
  return (
    <div className="two-column">
      <SectionBox title="Community">
        {loading ? <LoadingBox /> : null}
        {error ? <Notice kind="error">{error}</Notice> : null}
        {data ? (
          <table className="data-table">
            <thead><tr><th>Newest Channels</th><th>Joined</th><th>Subscribers</th></tr></thead>
            <tbody>
              {data.channels.items.slice(0, 12).map((channel) => (
                <tr key={channel.id}>
                  <td><Link to={`/user/${channel.username}`}>{channel.username}</Link>{channel.isVerified ? <VerifiedBadge /> : null}</td>
                  <td>{formatDate(channel.createdAt)}</td>
                  <td>{channel.stats?.subscribers ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </SectionBox>
      <SidebarBox title="Recent Videos">
        <VideoGrid videos={data?.recent.items.slice(0, 4) ?? []} />
      </SidebarBox>
    </div>
  );
}

export function NotFoundPage() {
  return (
    <SectionBox title="404 - Not Found">
      <Notice kind="yellow">The page you requested could not be found.</Notice>
      <OldButton onClick={() => window.location.assign("/")}>Return Home</OldButton>
    </SectionBox>
  );
}
