import { Link } from "react-router-dom";
import { Notice, SectionBox } from "../components/ui.js";

export function CreditsPage() {
  return (
    <SectionBox title="Credits & Thanks">
      <Notice kind="yellow">
        OpenTube is an independent open-source revival of early web video sharing. It is not affiliated with,
        endorsed by, or sponsored by YouTube or Google.
      </Notice>
      <p>
        Warm thanks to YouTube founders Chad Hurley, Steve Chen, and Jawed Karim, and to the early YouTube
        team and community, for helping define a more personal, playful, and accessible era of online video.
      </p>
      <p>
        OpenTube aims to preserve the spirit of that 2006-era web experience with original OpenTube branding,
        modern self-hosted infrastructure, and respect for creators, users, and the history that inspired it.
      </p>
      <p>
        This project uses original code and artwork. YouTube names and references are used only for historical
        commentary and attribution.
      </p>
      <p>
        <Link to="/">Return to OpenTube</Link>
      </p>
    </SectionBox>
  );
}
